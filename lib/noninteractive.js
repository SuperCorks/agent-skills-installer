/**
 * Non-interactive installer mode for coding agents and scripts.
 * Never prompts: everything comes from flags, results are returned as a report object.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { ALL_KEYWORD, EXIT_CODES, UsageError } from './cli-args.js';
import { fetchAvailableSkills, REPO_OWNER, REPO_NAME } from './skills.js';
import { fetchAvailableSubagents, SUBAGENTS_REPO_OWNER, SUBAGENTS_REPO_NAME } from './subagents.js';
import {
  checkSkillsForDirtyChanges,
  checkSkillsForUpdates,
  checkSubagentsForDirtyChanges,
  checkSubagentsForUpdates,
  getOriginUrl,
  isInsideGitWorkTree,
  listCheckedOutSkills,
  listCheckedOutSubagents,
  sparseCloneSkills,
  sparseCloneSubagents,
  updateSparseCheckout,
  updateSubagentsSparseCheckout
} from './git.js';
import { checkCodexAgentUpdates, listInstalledCodexAgents, syncCodexAgents } from './codex-agents.js';
import {
  allAgentDetectionTargets,
  allSkillDetectionTargets,
  getAgentInstallMode,
  getAgentInstallTargets,
  getSkillInstallTargets
} from './install-targets.js';
import { addToGitignore, isHomePath, isInGitignore, resolveInstallPath } from './installer-core.js';

/**
 * A failed install/update. Exits with EXIT_CODES.FAILURE unless stated otherwise.
 */
export class InstallError extends Error {
  constructor(code, message, details = {}, exitCode = EXIT_CODES.FAILURE) {
    super(message);
    this.name = 'InstallError';
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}

function repoUrlPattern(owner, name) {
  return new RegExp(`[/:]${owner}/${name}(\\.git)?/?$`, 'i');
}

const SKILLS_ORIGIN = repoUrlPattern(REPO_OWNER, REPO_NAME);
const AGENTS_ORIGIN = repoUrlPattern(SUBAGENTS_REPO_OWNER, SUBAGENTS_REPO_NAME);

const DEFAULT_DEPS = {
  fetchAvailableSkills,
  fetchAvailableSubagents,
  listCheckedOutSkills,
  listCheckedOutSubagents,
  sparseCloneSkills,
  sparseCloneSubagents,
  updateSparseCheckout,
  updateSubagentsSparseCheckout,
  checkSkillsForUpdates,
  checkSubagentsForUpdates,
  checkSkillsForDirtyChanges,
  checkSubagentsForDirtyChanges,
  listInstalledCodexAgents,
  checkCodexAgentUpdates,
  syncCodexAgents,
  getOriginUrl,
  isInsideGitWorkTree,
  matchesOrigin: (kind, url) => (kind === 'skills' ? SKILLS_ORIGIN : AGENTS_ORIGIN).test(url || ''),
  log: () => {}
};

function normalizeName(name) {
  return name.toLowerCase().replace(/\.agent\.md$/, '').replace(/[^a-z0-9]/g, '');
}

function withTrailingSlash(path) {
  return path.endsWith('/') ? path : `${path}/`;
}

/**
 * Match user-supplied names against known item ids (skill folders or agent filenames)
 * @returns {{matched: string[], unknown: string[]}}
 */
export function resolveNames(names, knownIds) {
  const byNormalizedName = new Map(knownIds.map(id => [normalizeName(id), id]));
  const matched = [];
  const unknown = [];

  for (const name of names) {
    const id = byNormalizedName.get(normalizeName(name));
    if (id) {
      matched.push(id);
    } else {
      unknown.push(name);
    }
  }

  return { matched: Array.from(new Set(matched)), unknown };
}

/**
 * Compute the desired installed set for one target
 * @returns {{desired: string[], added: string[], removed: string[]}}
 */
export function computeDesiredItems({ installed, add, remove, exact }) {
  const desired = exact
    ? [...add]
    : [...installed, ...add.filter(item => !installed.includes(item))].filter(item => !remove.includes(item));

  return {
    desired,
    added: desired.filter(item => !installed.includes(item)),
    removed: installed.filter(item => !desired.includes(item))
  };
}

function describeKind(kind, path, deps) {
  if (kind === 'skills') {
    return {
      kind,
      noun: 'skill',
      installMode: 'sparse-git',
      listInstalled: deps.listCheckedOutSkills,
      clone: deps.sparseCloneSkills,
      update: deps.updateSparseCheckout,
      checkUpdates: deps.checkSkillsForUpdates,
      checkDirty: deps.checkSkillsForDirtyChanges
    };
  }

  const installMode = getAgentInstallMode(path);
  if (installMode === 'codex-toml') {
    return {
      kind,
      noun: 'agent',
      installMode,
      listInstalled: deps.listInstalledCodexAgents,
      clone: (targetPath, items, onProgress) => deps.syncCodexAgents(resolveInstallPath(targetPath), items, onProgress),
      update: deps.syncCodexAgents,
      checkUpdates: deps.checkCodexAgentUpdates,
      checkDirty: async () => new Set()
    };
  }

  return {
    kind,
    noun: 'agent',
    installMode,
    listInstalled: deps.listCheckedOutSubagents,
    clone: deps.sparseCloneSubagents,
    update: deps.updateSubagentsSparseCheckout,
    checkUpdates: deps.checkSubagentsForUpdates,
    checkDirty: deps.checkSubagentsForDirtyChanges
  };
}

/**
 * Read what is installed at a target
 * @returns {Promise<{exists: boolean, installed: string[]}>}
 */
async function readInstallation(kindInfo, path, deps) {
  const absolutePath = resolveInstallPath(path);

  if (kindInfo.installMode === 'codex-toml') {
    const installed = await kindInfo.listInstalled(absolutePath).catch(() => []);
    return { exists: installed.length > 0, installed };
  }

  if (!existsSync(join(absolutePath, '.git'))) {
    return { exists: false, installed: [] };
  }

  const originUrl = await deps.getOriginUrl(absolutePath);
  if (!deps.matchesOrigin(kindInfo.kind, originUrl)) {
    throw new InstallError(
      'NOT_AN_INSTALLATION',
      `"${path}" is a git repository but not a ${kindInfo.kind} installation (origin: ${originUrl || 'none'}). Choose a different path.`,
      { path, origin: originUrl }
    );
  }

  return { exists: true, installed: await kindInfo.listInstalled(absolutePath) };
}

async function classifyUpdateTarget(path, deps) {
  if (getAgentInstallMode(path) === 'codex-toml') {
    return 'agents';
  }

  const absolutePath = resolveInstallPath(path);
  if (!existsSync(join(absolutePath, '.git'))) {
    throw new InstallError('NOT_INSTALLED', `Nothing is installed at "${path}", so there is nothing to update.`, { path });
  }

  const originUrl = await deps.getOriginUrl(absolutePath);
  if (deps.matchesOrigin('agents', originUrl)) return 'agents';
  if (deps.matchesOrigin('skills', originUrl)) return 'skills';

  throw new InstallError(
    'NOT_AN_INSTALLATION',
    `"${path}" is a git repository but not a skills or agents installation (origin: ${originUrl || 'none'}).`,
    { path, origin: originUrl }
  );
}

async function applyTarget(operation, options, deps) {
  const { kind, path, add, removeNames, exact, forceUpdate } = operation;
  const kindInfo = describeKind(kind, path, deps);
  const absolutePath = resolveInstallPath(path);
  const { exists, installed } = await readInstallation(kindInfo, path, deps);

  const removal = resolveNames(removeNames, installed);
  const { desired, added, removed } = computeDesiredItems({ installed, add, remove: removal.matched, exact });

  const result = {
    kind,
    path,
    absolutePath,
    action: 'unchanged',
    added,
    removed,
    notInstalled: removal.unknown,
    installed: desired
  };

  if (!exists && add.length === 0) {
    throw new InstallError('NOT_INSTALLED', `Nothing is installed at "${path}", so there is nothing to update or remove.`, { path });
  }

  if (desired.length === 0) {
    throw new InstallError(
      'EMPTY_SELECTION',
      `This would leave no ${kindInfo.noun}s installed at "${path}". Delete the directory instead if that is intended.`,
      { path },
      EXIT_CODES.USAGE
    );
  }

  const hasChanges = added.length > 0 || removed.length > 0;
  if (exists && !hasChanges && !forceUpdate) {
    return result;
  }

  if (options.dryRun) {
    result.action = exists ? 'would-update' : 'would-install';
    return result;
  }

  const onProgress = message => deps.log(`${path}: ${message}`);

  try {
    if (exists) {
      await kindInfo.update(absolutePath, desired, onProgress);
      result.action = 'updated';
    } else {
      await kindInfo.clone(path, desired, onProgress);
      result.action = 'installed';
    }
  } catch (error) {
    const dirty = exists ? Array.from(await kindInfo.checkDirty(absolutePath, installed).catch(() => new Set())) : [];
    throw new InstallError(
      exists ? 'UPDATE_FAILED' : 'INSTALL_FAILED',
      error.message,
      { path, dirty }
    );
  }

  if (options.gitignore && !exists && !isHomePath(path) && deps.isInsideGitWorkTree()) {
    const gitignorePath = resolveInstallPath('.gitignore');
    if (!isInGitignore(gitignorePath, path)) {
      result.gitignoreUpdated = addToGitignore(gitignorePath, path, deps.log);
    }
  }

  return result;
}

async function resolveAdditions(selection, kind, deps) {
  if (selection !== ALL_KEYWORD && selection.length === 0) {
    return [];
  }

  const available = kind === 'skills'
    ? (await deps.fetchAvailableSkills()).map(skill => skill.folder)
    : (await deps.fetchAvailableSubagents()).map(agent => agent.filename);

  if (selection === ALL_KEYWORD) {
    return available;
  }

  const { matched, unknown } = resolveNames(selection, available);
  if (unknown.length > 0) {
    throw new InstallError(
      'UNKNOWN_ITEM',
      `Unknown ${kind === 'skills' ? 'skill' : 'agent'}${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Run with --list to see what is available.`,
      { kind, unknown, available },
      EXIT_CODES.USAGE
    );
  }

  return matched;
}

async function buildOperations(options, deps) {
  const changesSkills = options.skills === ALL_KEYWORD || options.skills.length > 0 || options.removeSkills.length > 0;
  const changesAgents = options.agents === ALL_KEYWORD || options.agents.length > 0 || options.removeAgents.length > 0;

  const operations = [];
  const updateOnly = { add: [], removeNames: [], exact: false, forceUpdate: true };

  if (options.all) {
    const skillPaths = allSkillDetectionTargets().map(target => target.path);
    const agentPaths = allAgentDetectionTargets().map(target => target.path);

    for (const [kind, paths] of [['skills', skillPaths], ['agents', agentPaths]]) {
      for (const path of paths) {
        const { exists } = await readInstallation(describeKind(kind, path, deps), path, deps).catch(() => ({ exists: false }));
        if (exists) {
          operations.push({ kind, path, ...updateOnly });
        }
      }
    }

    if (operations.length === 0) {
      throw new InstallError('NOT_INSTALLED', 'No existing installations were detected, so there is nothing to update.');
    }
    return operations;
  }

  if (!changesSkills && !changesAgents) {
    for (const path of options.paths) {
      operations.push({ kind: await classifyUpdateTarget(path, deps), path, ...updateOnly });
    }
    for (const path of options.agentsPaths) {
      operations.push({ kind: 'agents', path, ...updateOnly });
    }
    return operations;
  }

  if (changesSkills) {
    const add = await resolveAdditions(options.skills, 'skills', deps);
    for (const path of options.paths) {
      operations.push({ kind: 'skills', path, add, removeNames: options.removeSkills, exact: options.exact && add.length > 0, forceUpdate: options.update });
    }
  }

  if (changesAgents) {
    const add = await resolveAdditions(options.agents, 'agents', deps);
    const agentPaths = changesSkills ? options.agentsPaths : [...options.agentsPaths, ...options.paths];
    for (const path of agentPaths) {
      operations.push({ kind: 'agents', path, add, removeNames: options.removeAgents, exact: options.exact && add.length > 0, forceUpdate: options.update });
    }
  }

  return operations;
}

async function describeTarget(kind, target, deps) {
  const kindInfo = describeKind(kind, target.path, deps);
  const absolutePath = resolveInstallPath(target.path);
  const entry = {
    path: target.path,
    absolutePath,
    harness: target.harness,
    scope: target.scope,
    exists: false,
    installed: [],
    updates: [],
    dirty: []
  };

  try {
    const { exists, installed } = await readInstallation(kindInfo, target.path, deps);
    entry.exists = exists;
    entry.installed = installed;
    if (exists) {
      entry.updates = Array.from(await kindInfo.checkUpdates(absolutePath, installed));
      entry.dirty = Array.from(await kindInfo.checkDirty(absolutePath, installed));
    }
  } catch (error) {
    entry.error = error.message;
  }

  return entry;
}

async function buildListReport(options, deps) {
  const [skills, agents] = await Promise.all([deps.fetchAvailableSkills(), deps.fetchAvailableSubagents()]);

  const listTargets = (standardTargets, detectionTargets, extraPaths) => {
    const standardPaths = new Set(standardTargets.map(target => target.path));
    const legacyTargets = detectionTargets.filter(target => !standardPaths.has(target.path));
    const knownPaths = new Set(detectionTargets.map(target => target.path));
    const customTargets = extraPaths
      .map(withTrailingSlash)
      .filter(path => !knownPaths.has(path))
      .map(path => ({ path, harness: 'custom', scope: 'custom' }));
    return { standardTargets, legacyTargets, customTargets };
  };

  const describeAll = async (kind, { standardTargets, legacyTargets, customTargets }) => {
    const [standard, legacy, custom] = await Promise.all([
      Promise.all(standardTargets.map(target => describeTarget(kind, target, deps))),
      Promise.all(legacyTargets.map(target => describeTarget(kind, target, deps))),
      Promise.all(customTargets.map(target => describeTarget(kind, target, deps)))
    ]);
    // Legacy locations are only worth reporting when something is installed there
    return [...standard, ...legacy.filter(entry => entry.exists), ...custom];
  };

  const [skillTargets, agentTargets] = await Promise.all([
    describeAll('skills', listTargets(getSkillInstallTargets(), allSkillDetectionTargets(), options.paths)),
    describeAll('agents', listTargets(getAgentInstallTargets(), allAgentDetectionTargets(), options.agentsPaths))
  ]);

  return {
    ok: true,
    available: {
      skills: skills.map(skill => skill.folder),
      agents: agents.map(agent => agent.filename)
    },
    targets: {
      skills: skillTargets,
      agents: agentTargets
    }
  };
}

/**
 * Run the installer without prompting
 * @param {object} options - Parsed options from parseCliArgs
 * @param {object} overrides - Dependency overrides (used by tests)
 * @returns {Promise<object>} Report describing what was listed or changed
 */
export async function runNonInteractive(options, overrides = {}) {
  const deps = { ...DEFAULT_DEPS, ...overrides };

  if (options.list) {
    return buildListReport(options, deps);
  }

  const operations = await buildOperations(options, deps);
  const results = [];

  for (const operation of operations) {
    try {
      results.push(await applyTarget(operation, options, deps));
    } catch (error) {
      if (error instanceof InstallError || error instanceof UsageError) {
        error.details = { ...error.details, completed: results };
        throw error;
      }
      throw new InstallError('INSTALL_FAILED', error.message, { path: operation.path, completed: results });
    }
  }

  return { ok: true, dryRun: options.dryRun, results };
}

/**
 * Turn any thrown error into the JSON error document
 */
export function errorToReport(error) {
  return {
    ok: false,
    error: {
      code: error.code || 'INSTALL_FAILED',
      message: error.message,
      ...(error.details || {})
    }
  };
}

function formatList(items) {
  return items.length > 0 ? items.join(', ') : 'none';
}

/**
 * Human-readable rendering of a report (used without --json)
 */
export function formatReport(report) {
  const lines = [];

  if (report.available) {
    lines.push(`Available skills (${report.available.skills.length}): ${formatList(report.available.skills)}`);
    lines.push(`Available agents (${report.available.agents.length}): ${formatList(report.available.agents)}`);

    for (const [kind, label] of [['skills', 'Skill targets'], ['agents', 'Agent targets']]) {
      lines.push('', `${label}:`);
      for (const target of report.targets[kind]) {
        const state = target.error
          ? `unreadable: ${target.error}`
          : target.exists
            ? `${target.installed.length} installed, ${target.updates.length} with updates, ${target.dirty.length} dirty`
            : 'not installed';
        lines.push(`  ${target.path} (${target.harness} | ${target.scope}) - ${state}`);
        if (target.exists) {
          lines.push(`    installed: ${formatList(target.installed)}`);
          if (target.updates.length > 0) lines.push(`    updates: ${formatList(target.updates)}`);
          if (target.dirty.length > 0) lines.push(`    dirty: ${formatList(target.dirty)}`);
        }
      }
    }

    return lines.join('\n');
  }

  for (const result of report.results) {
    lines.push(`${result.path} (${result.kind}): ${result.action}`);
    if (result.added.length > 0) lines.push(`  added: ${formatList(result.added)}`);
    if (result.removed.length > 0) lines.push(`  removed: ${formatList(result.removed)}`);
    if (result.notInstalled.length > 0) lines.push(`  not installed, skipped: ${formatList(result.notInstalled)}`);
    lines.push(`  installed (${result.installed.length}): ${formatList(result.installed)}`);
    if (result.gitignoreUpdated) lines.push('  added to .gitignore');
  }

  if (report.dryRun) {
    lines.push('', 'Dry run: nothing was changed.');
  }

  return lines.join('\n');
}
