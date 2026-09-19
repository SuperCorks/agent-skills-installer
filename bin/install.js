#!/usr/bin/env node

/**
 * @supercorks/skills-installer
 * Interactive CLI installer for AI agent skills and subagents
 * 
 * Usage: npx @supercorks/skills-installer install
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { 
  promptInstallType,
  promptInstallPath,
  promptAgentInstallPath, 
  promptGitignore, 
  promptSkillSelection,
  promptSubagentSelection,
  showSpinner,
  showSuccess,
  showSubagentSuccess,
  showError
} from '../lib/prompts.js';
import { fetchAvailableSkills, fetchSkillMetadata } from '../lib/skills.js';
import { fetchAvailableSubagents, fetchSubagentMetadata } from '../lib/subagents.js';
import { 
  sparseCloneSkills, 
  isGitAvailable, 
  isInsideGitWorkTree,
  listCheckedOutSkills, 
  updateSparseCheckout,
  sparseCloneSubagents,
  listCheckedOutSubagents,
  updateSubagentsSparseCheckout,
  checkSkillsForUpdates,
  checkSubagentsForUpdates,
  checkSkillsForDirtyChanges,
  checkSubagentsForDirtyChanges
} from '../lib/git.js';
import { createRequire } from 'module';
import { getAgentInstallMode } from '../lib/install-targets.js';
import { checkCodexAgentUpdates, listInstalledCodexAgents, syncCodexAgents } from '../lib/codex-agents.js';
import {
  addToGitignore,
  detectExistingAgentInstallations,
  detectExistingSkillInstallations,
  isHomePath,
  isInGitignore,
  resolveInstallPath
} from '../lib/installer-core.js';
import { EXIT_CODES, UsageError, parseCliArgs } from '../lib/cli-args.js';
import { errorToReport, formatReport, runNonInteractive } from '../lib/noninteractive.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
@supercorks/skills-installer v${VERSION}

Usage:
  npx @supercorks/skills-installer            Install skills/subagents interactively (default)
  npx @supercorks/skills-installer --help     Show this help message
  npx @supercorks/skills-installer --version  Show version

Examples:
  npx @supercorks/skills-installer
  npx @supercorks/skills-installer install

Non-interactive mode (for coding agents and scripts):
  Passing any of the flags below skips every prompt. Selection is additive:
  --skills/--agents only add, --remove-* only remove, nothing else is touched.

  --list                       Show available items and the state of every install target (read-only)
  --skills <a,b|all>           Skills to add (folder names)
  --agents <a,b|all>           Agents to add ("Architect" or "Architect.agent.md")
  --remove-skills <a,b>        Skills to remove
  --remove-agents <a,b>        Agents to remove
  --exact                      Make --skills/--agents the full installed set (removes everything else)
  --path <dir>                 Target directory (repeatable). Required for installs and removals.
                               Skills target, or agents target when only agents are changed.
  --agents-path <dir>          Agents target directory (repeatable)
  --update                     Pull the latest version of what is installed at the given paths
  --all                        With --update: refresh every detected installation
  --dry-run                    Report what would change without touching disk
  --gitignore                  Add a new local install path to .gitignore (never done otherwise)
  --json                       Print one JSON document on stdout (progress goes to stderr)
  -y, --yes                    Accepted for clarity; non-interactive mode never prompts

  Exit codes: 0 success, 1 runtime failure (network, git, dirty checkout), 2 usage error

  npx @supercorks/skills-installer install --list --json
  npx @supercorks/skills-installer install --yes --skills frontend-design,feature-dev --path ~/.claude/skills
  npx @supercorks/skills-installer install --yes --agents Architect,Tester --agents-path ~/.claude/agents
  npx @supercorks/skills-installer install --yes --remove-skills boulevard --path ~/.claude/skills
  npx @supercorks/skills-installer install --yes --update --all
`);
}

function uniqueItems(items) {
  return Array.from(new Set(items));
}

function unionSets(sets) {
  return new Set(sets.flatMap(set => Array.from(set)));
}

/**
 * Main installation flow
 */
async function runInstall() {
  console.log('\n🔧 AI Agent Skills & Subagents Installer\n');

  // Check git availability
  if (!isGitAvailable()) {
    showError('Git is not installed or not available in PATH. Please install git first.');
    process.exit(1);
  }

  // Step 1: Ask what to install
  const { skills: installSkills, subagents: installSubagents } = await promptInstallType();

  // Install skills if selected
  if (installSkills) {
    await runSkillsInstall();
  }

  // Install subagents if selected
  if (installSubagents) {
    await runSubagentsInstall();
  }
}

/**
 * Skills installation flow
 */
async function runSkillsInstall() {
  console.log('\n📦 Skills Installation\n');

  // Fetch available skills
  let skills;
  const fetchSpinner = showSpinner('Fetching available skills from repository...');
  try {
    skills = await fetchAvailableSkills();
    fetchSpinner.stop(`✅ Found ${skills.length} available skills`);
  } catch (error) {
    fetchSpinner.stop('❌ Failed to fetch skills');
    showError(`Could not fetch skills list: ${error.message}`);
    process.exit(1);
  }

  if (skills.length === 0) {
    showError('No skills found in the repository');
    process.exit(1);
  }

  // Detect existing installations
  const existingInstalls = await detectExistingSkillInstallations();

  // Ask where to install (showing existing installations if any)
  const installTargets = await promptInstallPath(existingInstalls, skills.length);

  const targetContexts = [];
  for (const [index, target] of installTargets.entries()) {
    if (installTargets.length > 1) {
      console.log(`\n📍 Preparing skills target ${index + 1}/${installTargets.length}: ${target.path}`);
    }
    targetContexts.push(await prepareSkillsInstallTarget(existingInstalls, target));
  }

  const installedSkills = uniqueItems(targetContexts.flatMap(context => context.installedSkills));
  const skillsNeedingUpdate = unionSets(targetContexts.map(context => context.skillsNeedingUpdate));
  const dirtySkills = unionSets(targetContexts.map(context => context.dirtySkills));

  const selectedSkills = await promptSkillSelection(
    skills,
    installedSkills,
    skillsNeedingUpdate,
    dirtySkills,
    (skillFolder) => fetchSkillMetadata(skillFolder)
  );

  for (let i = 0; i < targetContexts.length; i++) {
    if (targetContexts.length > 1) {
      console.log(`\n📍 Skills target ${i + 1}/${targetContexts.length}: ${targetContexts[i].installPath}`);
    }
    await runSkillsInstallForTarget(skills, targetContexts[i], selectedSkills);
  }
}

/**
 * Prepare a specific skills target for installation/update.
 * @param {Array<{path: string, skillCount: number, skills: string[]}>} existingInstalls
 * @param {{path: string, isExisting: boolean}} target
 * @returns {Promise<object>}
 */
async function prepareSkillsInstallTarget(existingInstalls, target) {
  const { path: installPath, isExisting } = target;
  const absoluteInstallPath = resolveInstallPath(installPath);
  const gitDir = join(absoluteInstallPath, '.git');
  const hasExistingRepo = existsSync(gitDir);

  // Get currently installed skills if managing existing installation
  let installedSkills = [];
  if (isExisting) {
    const existingInstall = existingInstalls.find(i => i.path === installPath);
    installedSkills = existingInstall?.skills || [];
  } else {
    // Check if manually entered path has an existing installation
    if (hasExistingRepo) {
      try {
        installedSkills = await listCheckedOutSkills(absoluteInstallPath);
      } catch {
        // If repo exists but sparse-checkout can't be read, still treat as manage mode.
        // Prompt will default to selecting all skills.
      }
    }
  }

  const isManageMode = isExisting || hasExistingRepo || installedSkills.length > 0;

  // Check for updates if in manage mode
  let skillsNeedingUpdate = new Set();
  let dirtySkills = new Set();
  if (isManageMode) {
    const updateSpinner = showSpinner('Checking for available updates...');
    let couldCheckUpdates = true;
    try {
      skillsNeedingUpdate = await checkSkillsForUpdates(absoluteInstallPath, installedSkills);
    } catch {
      couldCheckUpdates = false;
    }

    try {
      dirtySkills = await checkSkillsForDirtyChanges(absoluteInstallPath, installedSkills);
    } catch {
      // Dirty status is advisory; keep the install flow moving if it cannot be read.
    }

    const dirtyText = dirtySkills.size > 0
      ? `; ${dirtySkills.size} dirty`
      : '';

    if (!couldCheckUpdates) {
      updateSpinner.stop(`⚠️  Could not check for updates${dirtyText}`);
    } else {
      if (skillsNeedingUpdate.size > 0) {
        updateSpinner.stop(`✅ Found ${skillsNeedingUpdate.size} skill${skillsNeedingUpdate.size !== 1 ? 's' : ''} with updates available${dirtyText}`);
      } else {
        updateSpinner.stop(`✅ All installed skills are up to date${dirtyText}`);
      }
    }
  }

  // Ask about .gitignore (only for fresh installs and if not already in .gitignore)
  let shouldGitignore = false;
  const isInGitWorkTree = isInsideGitWorkTree();
  const gitignorePath = resolveInstallPath('.gitignore');
  if (
    isInGitWorkTree &&
    !isManageMode &&
    !isHomePath(installPath) &&
    !isInGitignore(gitignorePath, installPath)
  ) {
    shouldGitignore = await promptGitignore(installPath);
  }

  return {
    ...target,
    installPath,
    absoluteInstallPath,
    installedSkills,
    isManageMode,
    shouldGitignore,
    gitignorePath,
    skillsNeedingUpdate,
    dirtySkills
  };
}

/**
 * Install/update skills for a specific target path
 * @param {Array<{name: string, description: string, folder: string}>} skills
 * @param {object} targetContext
 * @param {string[]} selectedSkills
 */
async function runSkillsInstallForTarget(skills, targetContext, selectedSkills) {
  const {
    installPath,
    absoluteInstallPath,
    installedSkills,
    isManageMode,
    shouldGitignore,
    gitignorePath
  } = targetContext;

  // Perform installation or update
  console.log('');
  
  if (isManageMode) {
    // Calculate changes
    const toAdd = selectedSkills.filter(s => !installedSkills.includes(s));
    const toRemove = installedSkills.filter(s => !selectedSkills.includes(s));
    const unchanged = selectedSkills.filter(s => installedSkills.includes(s));

    if (toAdd.length === 0 && toRemove.length === 0) {
      console.log('ℹ️  No changes to apply. Pulling latest updates...');
    }

    const updateSpinner = showSpinner('Updating skills installation...');
    
    try {
      await updateSparseCheckout(absoluteInstallPath, selectedSkills, (message) => {
        updateSpinner.stop(`   ${message}`);
      });
    } catch (error) {
      updateSpinner.stop('❌ Update failed');
      showError(error.message);
      process.exit(1);
    }

    // Show summary of changes
    showSkillManageSuccess(installPath, skills, toAdd, toRemove, unchanged);
  } else {
    const installSpinner = showSpinner('Installing selected skills...');
    
    try {
      await sparseCloneSkills(installPath, selectedSkills, (message) => {
        installSpinner.stop(`   ${message}`);
      });
    } catch (error) {
      installSpinner.stop('❌ Installation failed');
      showError(error.message);
      process.exit(1);
    }

    // Update .gitignore if requested
    if (shouldGitignore) {
      addToGitignore(gitignorePath, installPath);
    }

    // Show success
    const installedSkillNames = skills
      .filter(s => selectedSkills.includes(s.folder))
      .map(s => s.name);
    
    showSuccess(installPath, installedSkillNames);
  }
}

/**
 * Subagents installation flow
 */
async function runSubagentsInstall() {
  console.log('\n🤖 Subagents Installation\n');

  // Fetch available subagents
  let subagents;
  const fetchSpinner = showSpinner('Fetching available subagents from repository...');
  try {
    subagents = await fetchAvailableSubagents();
    fetchSpinner.stop(`✅ Found ${subagents.length} available subagents`);
  } catch (error) {
    fetchSpinner.stop('❌ Failed to fetch subagents');
    showError(`Could not fetch subagents list: ${error.message}`);
    process.exit(1);
  }

  if (subagents.length === 0) {
    showError('No subagents found in the repository');
    process.exit(1);
  }

  // Detect existing installations
  const existingInstalls = await detectExistingAgentInstallations();

  // Ask where to install (showing existing installations if any)
  const installTargets = await promptAgentInstallPath(existingInstalls, subagents.length);

  const targetContexts = [];
  for (const [index, target] of installTargets.entries()) {
    if (installTargets.length > 1) {
      console.log(`\n📍 Preparing subagents target ${index + 1}/${installTargets.length}: ${target.path}`);
    }
    targetContexts.push(await prepareSubagentsInstallTarget(existingInstalls, target));
  }

  const installedAgents = uniqueItems(targetContexts.flatMap(context => context.installedAgents));
  const subagentsNeedingUpdate = unionSets(targetContexts.map(context => context.subagentsNeedingUpdate));
  const dirtySubagents = unionSets(targetContexts.map(context => context.dirtySubagents));

  const selectedAgents = await promptSubagentSelection(
    subagents,
    installedAgents,
    subagentsNeedingUpdate,
    dirtySubagents,
    (filename) => fetchSubagentMetadata(filename)
  );

  for (let i = 0; i < targetContexts.length; i++) {
    if (targetContexts.length > 1) {
      console.log(`\n📍 Subagents target ${i + 1}/${targetContexts.length}: ${targetContexts[i].installPath}`);
    }
    await runSubagentsInstallForTarget(subagents, targetContexts[i], selectedAgents);
  }
}

/**
 * Prepare a specific subagent target for installation/update.
 * @param {Array<{path: string, agentCount: number, agents: string[]}>} existingInstalls
 * @param {{path: string, isExisting: boolean}} target
 * @returns {Promise<object>}
 */
async function prepareSubagentsInstallTarget(existingInstalls, target) {
  const { path: installPath, isExisting } = target;
  const absoluteInstallPath = resolveInstallPath(installPath);
  const installMode = getAgentInstallMode(installPath);
  const gitDir = join(absoluteInstallPath, '.git');
  const hasExistingRepo = installMode === 'sparse-git' && existsSync(gitDir);

  // Get currently installed subagents if managing existing installation
  let installedAgents = [];
  if (isExisting) {
    const existingInstall = existingInstalls.find(i => i.path === installPath);
    installedAgents = existingInstall?.agents || [];
  } else if (installMode === 'sparse-git') {
    // Check if manually entered path has an existing installation
    if (hasExistingRepo) {
      try {
        installedAgents = await listCheckedOutSubagents(absoluteInstallPath);
      } catch {
        // If repo exists but sparse-checkout can't be read, still treat as manage mode.
        // Prompt will default to selecting all subagents.
      }
    }
  } else {
    try {
      installedAgents = await listInstalledCodexAgents(absoluteInstallPath);
    } catch {
      // Ignore detection failures for custom Codex agent paths.
    }
  }

  const isManageMode = installMode === 'sparse-git'
    ? (isExisting || hasExistingRepo || installedAgents.length > 0)
    : installedAgents.length > 0;

  // Check for updates if in manage mode
  let subagentsNeedingUpdate = new Set();
  let dirtySubagents = new Set();
  if (isManageMode) {
    const updateSpinner = showSpinner('Checking for available updates...');
    let couldCheckUpdates = true;
    try {
      subagentsNeedingUpdate = installMode === 'sparse-git'
        ? await checkSubagentsForUpdates(absoluteInstallPath, installedAgents)
        : await checkCodexAgentUpdates(absoluteInstallPath, installedAgents);
    } catch {
      couldCheckUpdates = false;
    }

    try {
      dirtySubagents = installMode === 'sparse-git'
        ? await checkSubagentsForDirtyChanges(absoluteInstallPath, installedAgents)
        : new Set();
    } catch {
      // Dirty status is advisory; keep the install flow moving if it cannot be read.
    }

    const dirtyText = dirtySubagents.size > 0
      ? `; ${dirtySubagents.size} dirty`
      : '';

    if (!couldCheckUpdates) {
      updateSpinner.stop(`⚠️  Could not check for updates${dirtyText}`);
    } else {
      if (subagentsNeedingUpdate.size > 0) {
        updateSpinner.stop(`✅ Found ${subagentsNeedingUpdate.size} subagent${subagentsNeedingUpdate.size !== 1 ? 's' : ''} with updates available${dirtyText}`);
      } else {
        updateSpinner.stop(`✅ All installed subagents are up to date${dirtyText}`);
      }
    }
  }

  // Ask about .gitignore (only for fresh installs and if not already in .gitignore)
  let shouldGitignore = false;
  const isInGitWorkTree = isInsideGitWorkTree();
  const gitignorePath = resolveInstallPath('.gitignore');
  if (
    isInGitWorkTree &&
    !isManageMode &&
    !isHomePath(installPath) &&
    !isInGitignore(gitignorePath, installPath)
  ) {
    shouldGitignore = await promptGitignore(installPath);
  }

  return {
    ...target,
    installPath,
    absoluteInstallPath,
    installMode,
    installedAgents,
    isManageMode,
    shouldGitignore,
    gitignorePath,
    subagentsNeedingUpdate,
    dirtySubagents
  };
}

/**
 * Install/update subagents for a specific target path
 * @param {Array<{name: string, description: string, filename: string}>} subagents
 * @param {object} targetContext
 * @param {string[]} selectedAgents
 */
async function runSubagentsInstallForTarget(subagents, targetContext, selectedAgents) {
  const {
    installPath,
    absoluteInstallPath,
    installMode,
    installedAgents,
    isManageMode,
    shouldGitignore,
    gitignorePath
  } = targetContext;

  // Perform installation or update
  console.log('');
  
  if (isManageMode) {
    // Calculate changes
    const toAdd = selectedAgents.filter(s => !installedAgents.includes(s));
    const toRemove = installedAgents.filter(s => !selectedAgents.includes(s));
    const unchanged = selectedAgents.filter(s => installedAgents.includes(s));

    if (toAdd.length === 0 && toRemove.length === 0) {
      console.log('ℹ️  No changes to apply. Pulling latest updates...');
    }

    const updateSpinner = showSpinner('Updating subagents installation...');
    
    try {
      if (installMode === 'sparse-git') {
        await updateSubagentsSparseCheckout(absoluteInstallPath, selectedAgents, (message) => {
          updateSpinner.stop(`   ${message}`);
        });
      } else {
        await syncCodexAgents(absoluteInstallPath, selectedAgents, (message) => {
          updateSpinner.stop(`   ${message}`);
        });
      }
    } catch (error) {
      updateSpinner.stop('❌ Update failed');
      showError(error.message);
      process.exit(1);
    }

    // Show summary of changes
    showAgentManageSuccess(installPath, subagents, toAdd, toRemove, unchanged);
  } else {
    const installSpinner = showSpinner('Installing selected subagents...');
    
    try {
      if (installMode === 'sparse-git') {
        await sparseCloneSubagents(installPath, selectedAgents, (message) => {
          installSpinner.stop(`   ${message}`);
        });
      } else {
        await syncCodexAgents(absoluteInstallPath, selectedAgents, (message) => {
          installSpinner.stop(`   ${message}`);
        });
      }
    } catch (error) {
      installSpinner.stop('❌ Installation failed');
      showError(error.message);
      process.exit(1);
    }

    // Update .gitignore if requested
    if (shouldGitignore) {
      addToGitignore(gitignorePath, installPath);
    }

    // Show success
    const installedAgentNames = subagents
      .filter(s => selectedAgents.includes(s.filename))
      .map(s => s.name);
    
    showSubagentSuccess(installPath, installedAgentNames);
  }
}

/**
 * Display success message for manage mode with skill change summary
 * @param {string} installPath - Where skills are installed
 * @param {Array<{name: string, folder: string}>} allSkills - All available skills
 * @param {string[]} added - Skill folders that were added
 * @param {string[]} removed - Skill folders that were removed
 * @param {string[]} unchanged - Skill folders that were unchanged
 */
function showSkillManageSuccess(installPath, allSkills, added, removed, unchanged) {
  const getSkillName = (folder) => allSkills.find(s => s.folder === folder)?.name || folder;
  
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Skills updated successfully!');
  console.log('═'.repeat(50));
  console.log(`\n📁 Location: ${installPath}`);
  
  if (added.length > 0) {
    console.log(`\n➕ Added (${added.length}):`);
    added.forEach(folder => console.log(`   • ${getSkillName(folder)}`));
  }
  
  if (removed.length > 0) {
    console.log(`\n➖ Removed (${removed.length}):`);
    removed.forEach(folder => console.log(`   • ${getSkillName(folder)}`));
  }
  
  if (unchanged.length > 0) {
    console.log(`\n📦 Unchanged (${unchanged.length}):`);
    unchanged.forEach(folder => console.log(`   • ${getSkillName(folder)}`));
  }
  
  const totalInstalled = added.length + unchanged.length;
  console.log(`\n🚀 ${totalInstalled} skill${totalInstalled !== 1 ? 's' : ''} now installed.`);
  console.log('═'.repeat(50) + '\n');
}

/**
 * Display success message for manage mode with subagent change summary
 * @param {string} installPath - Where subagents are installed
 * @param {Array<{name: string, filename: string}>} allAgents - All available subagents
 * @param {string[]} added - Agent filenames that were added
 * @param {string[]} removed - Agent filenames that were removed
 * @param {string[]} unchanged - Agent filenames that were unchanged
 */
function showAgentManageSuccess(installPath, allAgents, added, removed, unchanged) {
  const getAgentName = (filename) => allAgents.find(s => s.filename === filename)?.name || filename;
  
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Subagents updated successfully!');
  console.log('═'.repeat(50));
  console.log(`\n📁 Location: ${installPath}`);
  
  if (added.length > 0) {
    console.log(`\n➕ Added (${added.length}):`);
    added.forEach(filename => console.log(`   • ${getAgentName(filename)}`));
  }
  
  if (removed.length > 0) {
    console.log(`\n➖ Removed (${removed.length}):`);
    removed.forEach(filename => console.log(`   • ${getAgentName(filename)}`));
  }
  
  if (unchanged.length > 0) {
    console.log(`\n🤖 Unchanged (${unchanged.length}):`);
    unchanged.forEach(filename => console.log(`   • ${getAgentName(filename)}`));
  }
  
  const totalInstalled = added.length + unchanged.length;
  console.log(`\n🚀 ${totalInstalled} subagent${totalInstalled !== 1 ? 's' : ''} now installed.`);
  console.log('═'.repeat(50) + '\n');
}

/**
 * Run without prompts and report through stdout (result) and stderr (progress)
 * @param {object} options - Parsed non-interactive options
 */
async function runNonInteractiveCommand(options) {
  const fail = (error) => {
    if (options.json) {
      console.log(JSON.stringify(errorToReport(error), null, 2));
    } else {
      showError(error.message);
    }
    process.exit(error.exitCode || EXIT_CODES.FAILURE);
  };

  if (!isGitAvailable()) {
    const error = new Error('Git is not installed or not available in PATH. Please install git first.');
    error.code = 'GIT_UNAVAILABLE';
    fail(error);
  }

  try {
    const report = await runNonInteractive(options, {
      log: (message) => console.error(message)
    });
    console.log(options.json ? JSON.stringify(report, null, 2) : formatReport(report));
  } catch (error) {
    fail(error);
  }
}

/**
 * Parse command line arguments and run
 */
async function main() {
  let cli;
  try {
    cli = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(errorToReport(error), null, 2));
    } else {
      showError(error.message);
      console.error('Run with --help to see the available flags.\n');
    }
    process.exit(error.exitCode);
  }

  if (cli.help) {
    printUsage();
    process.exit(0);
  }

  if (cli.version) {
    console.log(VERSION);
    process.exit(0);
  }

  // Default to install if no command or explicit 'install' command
  if (cli.command && cli.command !== 'install') {
    console.error(`Unknown command: ${cli.command}`);
    printUsage();
    process.exit(1);
  }

  if (cli.nonInteractive) {
    await runNonInteractiveCommand(cli.options);
    return;
  }

  // The wizard needs a terminal; without one it would wait on a prompt forever.
  if (!process.stdin.isTTY && !process.env.SKILLS_INSTALLER_FORCE_INTERACTIVE) {
    showError(
      'No interactive terminal detected. Use the non-interactive flags instead, for example:\n' +
      '  skills-installer install --list --json\n' +
      '  skills-installer install --yes --skills <name> --path <dir>\n' +
      'Run with --help for all flags.'
    );
    process.exit(EXIT_CODES.USAGE);
  }

  try {
    await runInstall();
  } catch (error) {
    if (error.message.includes('User force closed')) {
      console.log('\n\n👋 Installation cancelled.\n');
      process.exit(0);
    }
    showError(error.message);
    process.exit(1);
  }
}

main();
