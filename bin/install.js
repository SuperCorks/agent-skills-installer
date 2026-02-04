#!/usr/bin/env node

/**
 * @supercorks/skills-installer
 * Interactive CLI installer for AI agent skills
 * 
 * Usage: npx @supercorks/skills-installer install
 */

import { existsSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { 
  promptInstallPath, 
  promptGitignore, 
  promptSkillSelection,
  showSpinner,
  showSuccess,
  showError
} from '../lib/prompts.js';
import { fetchAvailableSkills } from '../lib/skills.js';
import { sparseCloneSkills, isGitAvailable, listCheckedOutSkills, updateSparseCheckout } from '../lib/git.js';

const VERSION = '1.1.0';

// Common installation paths to check for existing installations
const COMMON_PATHS = ['.github/skills/', '.claude/skills/'];

/**
 * Detect existing skill installations in common paths
 * @returns {Promise<Array<{path: string, skillCount: number, skills: string[]}>>}
 */
async function detectExistingInstallations() {
  const installations = [];
  
  for (const path of COMMON_PATHS) {
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
 * Print usage information
 */
function printUsage() {
  console.log(`
@supercorks/skills-installer v${VERSION}

Usage:
  npx @supercorks/skills-installer            Install skills interactively (default)
  npx @supercorks/skills-installer --help     Show this help message
  npx @supercorks/skills-installer --version  Show version

Examples:
  npx @supercorks/skills-installer
  npx @supercorks/skills-installer install
`);
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
  console.log('\n🔧 AI Agent Skills Installer\n');

  // Check git availability
  if (!isGitAvailable()) {
    showError('Git is not installed or not available in PATH. Please install git first.');
    process.exit(1);
  }

  // Step 1: Fetch available skills
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

  // Step 2: Detect existing installations
  const existingInstalls = await detectExistingInstallations();

  // Step 3: Ask where to install (showing existing installations if any)
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

  // Step 4: Ask about .gitignore (only for fresh installs)
  let shouldGitignore = false;
  if (!isManageMode) {
    shouldGitignore = await promptGitignore(installPath);
  }

  // Step 5: Select skills (pre-select installed skills in manage mode)
  const selectedSkills = await promptSkillSelection(skills, installedSkills);

  // Step 6: Perform installation or update
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
    showManageSuccess(installPath, skills, toAdd, toRemove, unchanged);
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

    // Step 7: Update .gitignore if requested
    if (shouldGitignore) {
      const gitignorePath = resolve(process.cwd(), '.gitignore');
      addToGitignore(gitignorePath, installPath);
    }

    // Step 8: Show success
    const installedSkillNames = skills
      .filter(s => selectedSkills.includes(s.folder))
      .map(s => s.name);
    
    showSuccess(installPath, installedSkillNames);
  }
}

/**
 * Display success message for manage mode with change summary
 * @param {string} installPath - Where skills are installed
 * @param {Array<{name: string, folder: string}>} allSkills - All available skills
 * @param {string[]} added - Skill folders that were added
 * @param {string[]} removed - Skill folders that were removed
 * @param {string[]} unchanged - Skill folders that were unchanged
 */
function showManageSuccess(installPath, allSkills, added, removed, unchanged) {
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
