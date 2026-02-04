/**
 * Interactive CLI prompts using inquirer
 */

import inquirer from 'inquirer';
import * as readline from 'readline';

const PATH_CHOICES = {
  GITHUB: '.github/skills/',
  CLAUDE: '.claude/skills/',
  CUSTOM: '__custom__'
};

/**
 * Extract the first sentence from a description
 * @param {string} text - Full description text
 * @param {number} maxLength - Maximum length before truncating
 * @returns {string}
 */
function getFirstSentence(text, maxLength = 60) {
  if (!text) return '';
  // Match first sentence (ends with . ! or ?)
  const match = text.match(/^[^.!?]+[.!?]/);
  const sentence = match ? match[0].trim() : text;
  if (sentence.length <= maxLength) return sentence;
  return sentence.slice(0, maxLength - 3) + '...';
}

/**
 * Prompt user to select installation path, showing existing installations
 * @param {Array<{path: string, skillCount: number}>} existingInstalls - Detected existing installations
 * @returns {Promise<{path: string, isExisting: boolean}>} The selected path and whether it's existing
 */
export async function promptInstallPath(existingInstalls = []) {
  const choices = [];
  
  // Add existing installations at the top
  if (existingInstalls.length > 0) {
    existingInstalls.forEach(install => {
      choices.push({
        name: `${install.path} (${install.skillCount} skill${install.skillCount !== 1 ? 's' : ''} installed)`,
        value: { path: install.path, isExisting: true }
      });
    });
    choices.push(new inquirer.Separator('── New installation ──'));
  }
  
  // Standard path options
  const standardPaths = [PATH_CHOICES.GITHUB, PATH_CHOICES.CLAUDE];
  const existingPaths = existingInstalls.map(i => i.path);
  
  standardPaths.forEach(path => {
    if (!existingPaths.includes(path)) {
      choices.push({ name: path, value: { path, isExisting: false } });
    }
  });
  
  choices.push({ name: 'Custom path...', value: { path: PATH_CHOICES.CUSTOM, isExisting: false } });

  const { pathChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'pathChoice',
      message: existingInstalls.length > 0 
        ? 'Select an existing installation to manage, or choose a new location:'
        : 'Where would you like to install the skills?',
      choices
    }
  ]);

  if (pathChoice.path === PATH_CHOICES.CUSTOM) {
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
    return { path: customPath.trim(), isExisting: false };
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
 * Prompt user to select skills to install with expand/collapse support
 * @param {Array<{name: string, description: string, folder: string}>} skills - Available skills
 * @param {string[]} installedSkills - Already installed skill folder names (will be pre-selected)
 * @returns {Promise<string[]>} Selected skill folder names
 */
export async function promptSkillSelection(skills, installedSkills = []) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Enable raw mode for keypress detection
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(process.stdin, rl);

    let cursor = 0;
    const selected = new Set(installedSkills);
    const expanded = new Set();

    const render = () => {
      // Clear screen and move to top
      process.stdout.write('\x1B[2J\x1B[H');
      
      console.log('\n📦 Available Skills');
      console.log('─'.repeat(60));
      console.log('↑↓ navigate  SPACE toggle  → expand  ← collapse  A all  ENTER confirm\n');
      console.log('Select skills to install:\n');

      skills.forEach((skill, i) => {
        const isSelected = selected.has(skill.folder);
        const isCursor = i === cursor;
        const isExpanded = expanded.has(skill.folder);
        
        const checkbox = isSelected ? '◉' : '○';
        const pointer = isCursor ? '❯' : ' ';
        const expandIcon = isExpanded ? '▼' : '▶';
        
        // Highlight current line
        const highlight = isCursor ? '\x1B[36m' : '';  // Cyan for selected
        const reset = '\x1B[0m';
        
        const shortDesc = getFirstSentence(skill.description);
        
        if (isExpanded) {
          console.log(`${highlight}${pointer} ${checkbox} ${skill.name}${reset}`);
          // Show full description indented
          const fullDesc = skill.description || 'No description available';
          const lines = fullDesc.match(/.{1,55}/g) || [fullDesc];
          lines.forEach(line => {
            console.log(`     ${highlight}${line}${reset}`);
          });
        } else {
          console.log(`${highlight}${pointer} ${checkbox} ${skill.name} ${expandIcon} ${shortDesc}${reset}`);
        }
      });

      const selectedCount = selected.size;
      console.log(`\n${selectedCount} skill${selectedCount !== 1 ? 's' : ''} selected`);
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', handleKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    const handleKeypress = (str, key) => {
      if (!key) return;

      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error('User force closed the prompt'));
        return;
      }

      switch (key.name) {
        case 'up':
          cursor = cursor > 0 ? cursor - 1 : skills.length - 1;
          render();
          break;
        case 'down':
          cursor = cursor < skills.length - 1 ? cursor + 1 : 0;
          render();
          break;
        case 'right':
          expanded.add(skills[cursor].folder);
          render();
          break;
        case 'left':
          expanded.delete(skills[cursor].folder);
          render();
          break;
        case 'space':
          const folder = skills[cursor].folder;
          if (selected.has(folder)) {
            selected.delete(folder);
          } else {
            selected.add(folder);
          }
          render();
          break;
        case 'a':
          // Toggle all
          if (selected.size === skills.length) {
            selected.clear();
          } else {
            skills.forEach(s => selected.add(s.folder));
          }
          render();
          break;
        case 'return':
          if (selected.size === 0) {
            // Show error inline
            process.stdout.write('\x1B[31mPlease select at least one skill\x1B[0m');
            setTimeout(render, 1000);
          } else {
            cleanup();
            // Clear and show final selection
            process.stdout.write('\x1B[2J\x1B[H');
            console.log('\n📦 Selected skills:');
            skills.filter(s => selected.has(s.folder)).forEach(s => {
              console.log(`   ✓ ${s.name}`);
            });
            console.log('');
            resolve(Array.from(selected));
          }
          break;
      }
    };

    process.stdin.on('keypress', handleKeypress);
    render();
  });
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
