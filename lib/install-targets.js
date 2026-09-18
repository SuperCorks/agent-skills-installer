/**
 * Supported install targets for skills and agents.
 */

import { readdirSync, statSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Extra Claude config dirs in the home directory (CLAUDE_CONFIG_DIR profiles), e.g. ~/.claude_work
const CLAUDE_PROFILE_DIR_PATTERN = /^\.claude_.+$/;

export const SKILL_INSTALL_TARGETS = [
  { path: '~/.agents/skills/', harness: 'copilot/codex', scope: 'global' },
  { path: '~/.claude/skills/', harness: 'claude', scope: 'global' },
  { path: '.agents/skills/', harness: 'copilot/codex', scope: 'local' },
  { path: '.claude/skills/', harness: 'claude', scope: 'local' }
];

export const LEGACY_SKILL_INSTALL_TARGETS = [
  {
    path: '.github/skills/',
    harness: 'copilot',
    scope: 'legacy local'
  },
  {
    path: '~/.copilot/skills/',
    harness: 'copilot',
    scope: 'legacy global'
  },
  {
    path: '~/.codex/skills/',
    harness: 'codex',
    scope: 'legacy global'
  }
];

export const AGENT_INSTALL_TARGETS = [
  { path: '~/.agents/agents/', harness: 'copilot', scope: 'global', installMode: 'sparse-git' },
  { path: '~/.claude/agents/', harness: 'claude', scope: 'global', installMode: 'sparse-git' },
  { path: '~/.codex/agents/', harness: 'codex', scope: 'global', installMode: 'codex-toml' },
  { path: '.agents/agents/', harness: 'copilot', scope: 'local', installMode: 'sparse-git' },
  { path: '.claude/agents/', harness: 'claude', scope: 'local', installMode: 'sparse-git' },
  { path: '.codex/agents/', harness: 'codex', scope: 'local', installMode: 'codex-toml' }
];

export const LEGACY_AGENT_INSTALL_TARGETS = [
  {
    path: '.github/agents/',
    harness: 'copilot',
    scope: 'legacy local'
  },
  {
    path: '~/.copilot/agents/',
    harness: 'copilot',
    scope: 'legacy global'
  }
];

/**
 * Find ~/.claude_* profile directories
 * @param {string} homeDir - Home directory to scan
 * @returns {string[]} Sorted directory names (e.g. ['.claude_personal', '.claude_work'])
 */
export function discoverClaudeProfileDirs(homeDir = homedir()) {
  let entries;
  try {
    entries = readdirSync(homeDir);
  } catch {
    return [];
  }

  return entries
    .filter(name => CLAUDE_PROFILE_DIR_PATTERN.test(name))
    .filter(name => {
      try {
        // statSync follows symlinks, so symlinked profile dirs count too
        return statSync(join(homeDir, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function withClaudeProfileTargets(targets, subdir, homeDir) {
  const profileTargets = discoverClaudeProfileDirs(homeDir).map(name => ({
    path: `~/${name}/${subdir}/`,
    harness: 'claude',
    scope: 'global',
    installMode: 'sparse-git'
  }));
  const claudeIndex = targets.findIndex(target => target.path === `~/.claude/${subdir}/`);

  return [
    ...targets.slice(0, claudeIndex + 1),
    ...profileTargets,
    ...targets.slice(claudeIndex + 1)
  ];
}

/**
 * Standard skill targets plus one global target per ~/.claude_* profile directory
 */
export function getSkillInstallTargets(homeDir = homedir()) {
  return withClaudeProfileTargets(SKILL_INSTALL_TARGETS, 'skills', homeDir);
}

/**
 * Standard agent targets plus one global target per ~/.claude_* profile directory
 */
export function getAgentInstallTargets(homeDir = homedir()) {
  return withClaudeProfileTargets(AGENT_INSTALL_TARGETS, 'agents', homeDir);
}

export function allSkillDetectionTargets(homeDir = homedir()) {
  return [...getSkillInstallTargets(homeDir), ...LEGACY_SKILL_INSTALL_TARGETS];
}

export function allAgentDetectionTargets(homeDir = homedir()) {
  return [...getAgentInstallTargets(homeDir), ...LEGACY_AGENT_INSTALL_TARGETS];
}

export function orderTargetsGlobalFirst(targets) {
  return [...targets].sort((left, right) => {
    const leftGlobal = left.scope.includes('global') ? 0 : 1;
    const rightGlobal = right.scope.includes('global') ? 0 : 1;

    if (leftGlobal !== rightGlobal) {
      return leftGlobal - rightGlobal;
    }

    return targets.indexOf(left) - targets.indexOf(right);
  });
}

export function getAgentInstallMode(path) {
  const exactTarget = getTargetByPath(AGENT_INSTALL_TARGETS, path);
  if (exactTarget?.installMode) {
    return exactTarget.installMode;
  }

  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalizedPath.endsWith('/.codex/agents') || normalizedPath === '.codex/agents' || normalizedPath === '~/.codex/agents') {
    return 'codex-toml';
  }

  return 'sparse-git';
}

export function getTargetByPath(targets, path) {
  return targets.find(target => target.path === path);
}

export function formatTargetLabel(target, count, noun, { installed = false } = {}) {
  const plural = count === 1 ? noun : `${noun}s`;
  const countText = installed ? `${count} ${plural} installed` : `${count} ${plural}`;
  const detail = target
    ? `${target.harness} | ${target.scope} | ${countText}`
    : countText;

  return `${target?.path || ''} (${detail})`;
}