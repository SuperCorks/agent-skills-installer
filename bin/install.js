#!/usr/bin/env node

/**
 * @supercorks/install-skills
 * Interactive CLI installer for AI agent skills
 * 
 * Usage: npx @supercorks/install-skills install
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
import { sparseCloneSkills, isGitAvailable } from '../lib/git.js';

const VERSION = '1.0.0';

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
@supercorks/install-skills v${VERSION}

Usage:
  npx @supercorks/install-skills install    Install skills interactively
  npx @supercorks/install-skills --help     Show this help message
  npx @supercorks/install-skills --version  Show version

Examples:
  npx @supercorks/install-skills install
  npx --package=@supercorks/install-skills install-skills install
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

  // Step 2: Ask where to install
  const installPath = await promptInstallPath();
  const absoluteInstallPath = resolve(process.cwd(), installPath);

  // Check if path already exists with a git repo
  if (existsSync(join(absoluteInstallPath, '.git'))) {
    showError(`"${installPath}" already contains a git repository. Please remove it first or choose a different path.`);
    process.exit(1);
  }

  // Step 3: Ask about .gitignore
  const shouldGitignore = await promptGitignore(installPath);

  // Step 4: Select skills
  const selectedSkills = await promptSkillSelection(skills);

  // Step 5: Perform installation
  console.log('');
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

  // Step 6: Update .gitignore if requested
  if (shouldGitignore) {
    const gitignorePath = resolve(process.cwd(), '.gitignore');
    addToGitignore(gitignorePath, installPath);
  }

  // Step 7: Show success
  const installedSkillNames = skills
    .filter(s => selectedSkills.includes(s.folder))
    .map(s => s.name);
  
  showSuccess(installPath, installedSkillNames);
}

/**
 * Parse command line arguments and run
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    process.exit(0);
  }

  if (command === 'install') {
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
