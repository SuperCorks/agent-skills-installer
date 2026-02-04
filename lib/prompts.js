/**
 * Interactive CLI prompts using inquirer
 */

import inquirer from 'inquirer';

const PATH_CHOICES = {
  GITHUB: '.github/skills/',
  CLAUDE: '.claude/skills/',
  CUSTOM: '__custom__'
};

/**
 * Prompt user to select installation path
 * @returns {Promise<string>} The selected or custom path
 */
export async function promptInstallPath() {
  const { pathChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'pathChoice',
      message: 'Where would you like to install the skills?',
      choices: [
        { name: '.github/skills/', value: PATH_CHOICES.GITHUB },
        { name: '.claude/skills/', value: PATH_CHOICES.CLAUDE },
        { name: 'Custom path...', value: PATH_CHOICES.CUSTOM }
      ],
      default: PATH_CHOICES.GITHUB
    }
  ]);

  if (pathChoice === PATH_CHOICES.CUSTOM) {
    const { customPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'customPath',
        message: 'Enter custom installation path:',
        validate: (input) => {
          if (!input.trim()) {
            return 'Please enter a valid path';
          }
          return true;
        }
      }
    ]);
    return customPath.trim();
  }

  return pathChoice;
}

/**
 * Prompt user whether to add path to .gitignore
 * @param {string} installPath - The installation path to potentially ignore
 * @returns {Promise<boolean>}
 */
export async function promptGitignore(installPath) {
  const { shouldIgnore } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldIgnore',
      message: `Add "${installPath}" to .gitignore?`,
      default: true
    }
  ]);

  return shouldIgnore;
}

/**
 * Prompt user to select skills to install
 * @param {Array<{name: string, description: string, folder: string}>} skills - Available skills
 * @returns {Promise<string[]>} Selected skill folder names
 */
export async function promptSkillSelection(skills) {
  console.log('\n📦 Available Skills');
  console.log('─'.repeat(50));
  console.log('Use ↑↓ to navigate, SPACE to toggle, A to toggle all, ENTER to confirm\n');

  const { selectedSkills } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedSkills',
      message: 'Select skills to install:',
      choices: skills.map(skill => ({
        name: `${skill.name} - ${skill.description}`,
        value: skill.folder,
        short: skill.name
      })),
      pageSize: 15,
      loop: false,
      validate: (answer) => {
        if (answer.length === 0) {
          return 'Please select at least one skill to install';
        }
        return true;
      }
    }
  ]);

  return selectedSkills;
}

/**
 * Display a spinner/loading message
 * @param {string} message - Message to display
 * @returns {{stop: (finalMessage: string) => void}}
 */
export function showSpinner(message) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  
  process.stdout.write(`${frames[0]} ${message}`);
  
  const interval = setInterval(() => {
    i = (i + 1) % frames.length;
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(`${frames[i]} ${message}`);
  }, 80);

  return {
    stop: (finalMessage) => {
      clearInterval(interval);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      console.log(finalMessage);
    }
  };
}

/**
 * Display success message with next steps
 * @param {string} installPath - Where skills were installed
 * @param {string[]} installedSkills - List of installed skill names
 */
export function showSuccess(installPath, installedSkills) {
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Skills installed successfully!');
  console.log('═'.repeat(50));
  console.log(`\n📁 Location: ${installPath}`);
  console.log(`\n📦 Installed skills (${installedSkills.length}):`);
  installedSkills.forEach(skill => console.log(`   • ${skill}`));
  console.log('\n🚀 Your AI agent will automatically discover these skills.');
  console.log('═'.repeat(50) + '\n');
}

/**
 * Display error message
 * @param {string} message - Error message
 */
export function showError(message) {
  console.error(`\n❌ Error: ${message}\n`);
}
