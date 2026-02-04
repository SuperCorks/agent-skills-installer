#!/usr/bin/env node

/**
 * @supercorks/skills-installer
 * Interactive CLI installer for AI agent skills and subagents
 * 
 * Usage: npx @supercorks/skills-installer install
 */

import { existsSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
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
import { fetchAvailableSkills } from '../lib/skills.js';
import { fetchAvailableSubagents } from '../lib/subagents.js';
import { 
  sparseCloneSkills, 
  isGitAvailable, 
  listCheckedOutSkills, 
  updateSparseCheckout,
  sparseCloneSubagents,
  listCheckedOutSubagents,
  updateSubagentsSparseCheckout
} from '../lib/git.js';

const VERSION = '1.3.0';

// Common installation paths to check for existing installations
const SKILL_PATHS = ['.github/skills/', '.claude/skills/'];
const AGENT_PATHS = ['.github/agents/', '.claude/agents/'];

/**
 * Detect existing skill installations in common paths
 * @returns {Promise<Array<{path: string, skillCount: number, skills: string[]}>>}
 */
async function detectExistingSkillInstallations() {
  const installations = [];
  
  for (const path of SKILL_PATHS) {
    const absolutePath = resolve(process.cwd(), path);
    const gitDir = join(absolutePath, '.git');
    
    if (existsSync(gitDir)) {
      try {
        const skills = await listCheckedOutSkills(absolutePath);
        installations.push({
          path,
          skillCount: skills.length,
          skills
        });
      } catch {
        // Ignore errors reading existing installations
      }
    }
  }
  
  return installations;
}

/**
 * Detect existing subagent installations in common paths
 * @returns {Promise<Array<{path: string, agentCount: number, agents: string[]}>>}
 */
async function detectExistingAgentInstallations() {
  const installations = [];
  
  for (const path of AGENT_PATHS) {
    const absolutePath = resolve(process.cwd(), path);
    const gitDir = join(absolutePath, '.git');
    
    if (existsSync(gitDir)) {
      try {
        const agents = await listCheckedOutSubagents(absolutePath);
        installations.push({
          path,
          agentCount: agents.length,
          agents
        });
      } catch {
        // Ignore errors reading existing installations
      }
    }
  }
  
  return installations;
}

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
`);
}

/**
 * Check if a path is already in .gitignore
 * @param {string} gitignorePath - Path to .gitignore file
 * @param {string} pathToCheck - Path to check
 * @returns {boolean}
 */
function isInGitignore(gitignorePath, pathToCheck) {
  if (!existsSync(gitignorePath)) {
    return false;
  }
  const normalizedPath = pathToCheck.replace(/\/$/, '');
  const content = readFileSync(gitignorePath, 'utf-8');
  return content.includes(normalizedPath);
}

/**
 * Add a path to .gitignore if not already present
 * @param {string} gitignorePath - Path to .gitignore file
 * @param {string} pathToIgnore - Path to add to .gitignore
 */
function addToGitignore(gitignorePath, pathToIgnore) {
  // Normalize the path for gitignore (remove trailing slash for consistency)
  const normalizedPath = pathToIgnore.replace(/\/$/, '');
  const gitignoreEntry = `\n# AI Agent Skills\n${normalizedPath}/\n`;

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes(normalizedPath)) {
      console.log(`ℹ️  "${normalizedPath}" is already in .gitignore`);
      return;
    }
    appendFileSync(gitignorePath, gitignoreEntry);
  } else {
    writeFileSync(gitignorePath, gitignoreEntry.trim() + '\n');
  }
  console.log(`✅ Added "${normalizedPath}/" to .gitignore`);
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
  const { path: installPath, isExisting } = await promptInstallPath(existingInstalls);
  const absoluteInstallPath = resolve(process.cwd(), installPath);

  // Get currently installed skills if managing existing installation
  let installedSkills = [];
  if (isExisting) {
    const existingInstall = existingInstalls.find(i => i.path === installPath);
    installedSkills = existingInstall?.skills || [];
  } else {
    // Check if manually entered path has an existing installation
    const gitDir = join(absoluteInstallPath, '.git');
    if (existsSync(gitDir)) {
      try {
        installedSkills = await listCheckedOutSkills(absoluteInstallPath);
      } catch {
        // If we can't read it, treat as fresh install
      }
    }
  }

  const isManageMode = installedSkills.length > 0;

  // Ask about .gitignore (only for fresh installs and if not already in .gitignore)
  let shouldGitignore = false;
  const gitignorePath = resolve(process.cwd(), '.gitignore');
  if (!isManageMode && !isInGitignore(gitignorePath, installPath)) {
    shouldGitignore = await promptGitignore(installPath);
  }

  // Select skills (pre-select installed skills in manage mode)
  const selectedSkills = await promptSkillSelection(skills, installedSkills);

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
  const { path: installPath, isExisting } = await promptAgentInstallPath(existingInstalls);
  const absoluteInstallPath = resolve(process.cwd(), installPath);

  // Get currently installed subagents if managing existing installation
  let installedAgents = [];
  if (isExisting) {
    const existingInstall = existingInstalls.find(i => i.path === installPath);
    installedAgents = existingInstall?.agents || [];
  } else {
    // Check if manually entered path has an existing installation
    const gitDir = join(absoluteInstallPath, '.git');
    if (existsSync(gitDir)) {
      try {
        installedAgents = await listCheckedOutSubagents(absoluteInstallPath);
      } catch {
        // If we can't read it, treat as fresh install
      }
    }
  }

  const isManageMode = installedAgents.length > 0;

  // Ask about .gitignore (only for fresh installs and if not already in .gitignore)
  let shouldGitignore = false;
  const gitignorePath = resolve(process.cwd(), '.gitignore');
  if (!isManageMode && !isInGitignore(gitignorePath, installPath)) {
    shouldGitignore = await promptGitignore(installPath);
  }

  // Select subagents (pre-select installed ones in manage mode)
  const selectedAgents = await promptSubagentSelection(subagents, installedAgents);

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
      await updateSubagentsSparseCheckout(absoluteInstallPath, selectedAgents, (message) => {
        updateSpinner.stop(`   ${message}`);
      });
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
      await sparseCloneSubagents(installPath, selectedAgents, (message) => {
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
 * Parse command line arguments and run
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  // Default to install if no command or explicit 'install' command
  if (!command || command === 'install') {
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
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

main();
