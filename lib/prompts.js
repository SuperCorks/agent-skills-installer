/**
 * Interactive CLI prompts using inquirer
 */

import inquirer from 'inquirer';
import * as readline from 'readline';
import {
  AGENT_INSTALL_TARGETS,
  SKILL_INSTALL_TARGETS,
  allAgentDetectionTargets,
  allSkillDetectionTargets,
  formatTargetLabel,
  getTargetByPath,
  orderTargetsGlobalFirst
} from './install-targets.js';

const SKILL_PATH_CHOICES = {
  CUSTOM: '__custom__'
};

const AGENT_PATH_CHOICES = {
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
 * Prompt user to select what to install
 * @returns {Promise<{skills: boolean, subagents: boolean}>}
 */
export async function promptInstallType() {
  const { installType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'installType',
      message: 'What would you like to install?',
      choices: [
        { name: 'Skills and Agents', value: 'both' },
        { name: 'Skills only', value: 'skills' },
        { name: 'Agents only', value: 'subagents' }
      ]
    }
  ]);

  return {
    skills: installType === 'skills' || installType === 'both',
    subagents: installType === 'subagents' || installType === 'both'
  };
}

/**
 * Prompt user to select one or more installation paths, showing existing installations
 * @param {Array<{path: string, skillCount: number}>} existingInstalls - Detected existing installations
 * @param {number} availableSkillCount - Number of skills available for new installations
 * @returns {Promise<Array<{path: string, isExisting: boolean}>>} Selected paths and whether each is existing
 */
export async function promptInstallPath(existingInstalls = [], availableSkillCount = 0) {
  const choices = [];
  const detectionTargets = allSkillDetectionTargets();
  const existingByPath = new Map(existingInstalls.map(install => [install.path, install]));
  const standardPaths = new Set(SKILL_INSTALL_TARGETS.map(target => target.path));
  
  orderTargetsGlobalFirst(SKILL_INSTALL_TARGETS).forEach(target => {
    const install = existingByPath.get(target.path);
    choices.push({
      name: install
        ? formatTargetLabel(target, install.skillCount, 'skill', { installed: true })
        : formatTargetLabel(target, availableSkillCount, 'skill'),
      value: target.path
    });
  });

  const existingLegacyOrCustom = existingInstalls.filter(install => !standardPaths.has(install.path));
  if (existingLegacyOrCustom.length > 0) {
    choices.push(new inquirer.Separator('── Existing legacy/custom installations ──'));
    orderTargetsGlobalFirst(existingLegacyOrCustom.map(install => getTargetByPath(detectionTargets, install.path) || {
      path: install.path,
      harness: 'custom',
      scope: 'existing'
    })).forEach(target => {
      const install = existingByPath.get(target.path);
      choices.push({
        name: target
          ? formatTargetLabel(target, install.skillCount, 'skill', { installed: true })
          : `${install.path} (${install.skillCount} skill${install.skillCount !== 1 ? 's' : ''} installed)`,
        value: install.path
      });
    });
  }

  choices.push(new inquirer.Separator('── Other ──'));
  choices.push({ name: 'Custom path...', value: SKILL_PATH_CHOICES.CUSTOM });

  const { pathChoices } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'pathChoices',
      message: existingInstalls.length > 0 
        ? 'Select one or more installations to manage, or choose new locations:'
        : 'Where would you like to install the skills? (Select one or more)',
      choices,
      validate: (input) => {
        if (!input || input.length === 0) {
          return 'Please select at least one installation path';
        }
        return true;
      }
    }
  ]);

  const selected = [];
  const selectedSet = new Set(pathChoices);

  pathChoices
    .filter(path => path !== SKILL_PATH_CHOICES.CUSTOM)
    .forEach(path => {
      selected.push({ path, isExisting: existingByPath.has(path) });
    });

  if (selectedSet.has(SKILL_PATH_CHOICES.CUSTOM)) {
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
    selected.push({ path: customPath.trim(), isExisting: false });
  }

  const deduped = new Map();
  selected.forEach(entry => deduped.set(entry.path, entry));
  return Array.from(deduped.values());
}

/**
 * Prompt user to select one or more subagent installation paths
 * @param {Array<{path: string, agentCount: number}>} existingInstalls - Detected existing installations
 * @param {number} availableAgentCount - Number of agents available for new installations
 * @returns {Promise<Array<{path: string, isExisting: boolean}>>} Selected paths and whether each is existing
 */
export async function promptAgentInstallPath(existingInstalls = [], availableAgentCount = 0) {
  const choices = [];
  const detectionTargets = allAgentDetectionTargets();
  const existingByPath = new Map(existingInstalls.map(install => [install.path, install]));
  const standardPaths = new Set(AGENT_INSTALL_TARGETS.map(target => target.path));
  
  orderTargetsGlobalFirst(AGENT_INSTALL_TARGETS).forEach(target => {
    const install = existingByPath.get(target.path);
    choices.push({
      name: install
        ? formatTargetLabel(target, install.agentCount, 'agent', { installed: true })
        : formatTargetLabel(target, availableAgentCount, 'agent'),
      value: target.path,
      disabled: target.disabledReason
    });
  });

  const existingLegacyOrCustom = existingInstalls.filter(install => !standardPaths.has(install.path));
  if (existingLegacyOrCustom.length > 0) {
    choices.push(new inquirer.Separator('── Existing legacy/custom installations ──'));
    orderTargetsGlobalFirst(existingLegacyOrCustom.map(install => getTargetByPath(detectionTargets, install.path) || {
      path: install.path,
      harness: 'custom',
      scope: 'existing'
    })).forEach(target => {
      const install = existingByPath.get(target.path);
      choices.push({
        name: target
          ? formatTargetLabel(target, install.agentCount, 'agent', { installed: true })
          : `${install.path} (${install.agentCount} agent${install.agentCount !== 1 ? 's' : ''} installed)`,
        value: install.path
      });
    });
  }

  choices.push(new inquirer.Separator('── Other ──'));
  choices.push({ name: 'Custom path...', value: AGENT_PATH_CHOICES.CUSTOM });

  const { pathChoices } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'pathChoices',
      message: existingInstalls.length > 0 
        ? 'Select one or more installations to manage, or choose new locations:'
        : 'Where would you like to install the subagents? (Select one or more)',
      choices,
      validate: (input) => {
        if (!input || input.length === 0) {
          return 'Please select at least one installation path';
        }
        return true;
      }
    }
  ]);

  const selected = [];
  const selectedSet = new Set(pathChoices);

  pathChoices
    .filter(path => path !== AGENT_PATH_CHOICES.CUSTOM)
    .forEach(path => {
      selected.push({ path, isExisting: existingByPath.has(path) });
    });

  if (selectedSet.has(AGENT_PATH_CHOICES.CUSTOM)) {
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
    selected.push({ path: customPath.trim(), isExisting: false });
  }

  const deduped = new Map();
  selected.forEach(entry => deduped.set(entry.path, entry));
  return Array.from(deduped.values());
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
 * @param {Set<string>} skillsNeedingUpdate - Skill folder names that have updates available
 * @param {(skillFolder: string) => Promise<{name?: string, description?: string}>} metadataLoader - Lazy metadata loader
 * @returns {Promise<string[]>} Selected skill folder names
 */
export async function promptSkillSelection(skills, installedSkills = [], skillsNeedingUpdate = new Set(), metadataLoader = null) {
  return promptItemSelection(
    skills.map(s => ({ id: s.folder, name: s.name, description: s.description })),
    installedSkills,
    '📦 Available Skills',
    skillsNeedingUpdate,
    metadataLoader
  );
}

/**
 * Prompt user to select subagents to install with expand/collapse support
 * @param {Array<{name: string, description: string, filename: string}>} subagents - Available subagents
 * @param {string[]} installedSubagents - Already installed subagent filenames (will be pre-selected)
 * @param {Set<string>} subagentsNeedingUpdate - Subagent filenames that have updates available
 * @param {(agentFilename: string) => Promise<{name?: string, description?: string}>} metadataLoader - Lazy metadata loader
 * @returns {Promise<string[]>} Selected subagent filenames
 */
export async function promptSubagentSelection(subagents, installedSubagents = [], subagentsNeedingUpdate = new Set(), metadataLoader = null) {
  return promptItemSelection(
    subagents.map(s => ({ id: s.filename, name: s.name, description: s.description })),
    installedSubagents,
    '🤖 Available Subagents',
    subagentsNeedingUpdate,
    metadataLoader
  );
}

/**
 * Generic item selection prompt with expand/collapse support
 * @param {Array<{id: string, name: string, description: string}>} items - Available items
 * @param {string[]} installedItems - Already installed item IDs (will be pre-selected)
 * @param {string} title - Title to display
 * @param {Set<string>} itemsNeedingUpdate - Item IDs that have updates available
 * @param {(itemId: string) => Promise<{name?: string, description?: string}>} metadataLoader - Lazy metadata loader
 * @returns {Promise<string[]>} Selected item IDs
 */
function promptItemSelection(items, installedItems = [], title = '📦 Available Items', itemsNeedingUpdate = new Set(), metadataLoader = null) {
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
    // If nothing is installed, select all by default; otherwise pre-select installed items
    const selected = installedItems.length > 0 
      ? new Set(installedItems) 
      : new Set(items.map(item => item.id));
    const expanded = new Set();
    const metadataCache = new Set();
    const metadataLoading = new Set();

    const render = () => {
      // Clear screen and move to top
      process.stdout.write('\x1B[2J\x1B[H');
      
      console.log(`\n${title}`);
      console.log('─'.repeat(60));
      console.log('↑↓ navigate  SPACE toggle  → expand/load  ← collapse  A all  ENTER confirm\n');
      console.log('Select items to install:\n');

      items.forEach((item, i) => {
        const isSelected = selected.has(item.id);
        const isCursor = i === cursor;
        const isExpanded = expanded.has(item.id);
        const needsUpdate = itemsNeedingUpdate.has(item.id);
        
        const checkbox = isSelected ? '◉' : '○';
        const pointer = isCursor ? '❯' : ' ';
        const expandIcon = isExpanded ? '▼' : '▶';
        const updateFlag = needsUpdate ? ' \x1B[33m(update)\x1B[0m' : '';
        
        // Highlight current line
        const highlight = isCursor ? '\x1B[36m' : '';  // Cyan for selected
        const reset = '\x1B[0m';
        
        const shortDesc = getFirstSentence(item.description);
        
        if (isExpanded) {
          console.log(`${highlight}${pointer} ${checkbox} ${item.name}${reset}${updateFlag}`);
          // Show full description indented
          const fullDesc = metadataLoading.has(item.id)
            ? 'Loading description...'
            : (item.description || 'No description available');
          const lines = fullDesc.match(/.{1,55}/g) || [fullDesc];
          lines.forEach(line => {
            console.log(`     ${highlight}${line}${reset}`);
          });
        } else {
          console.log(`${highlight}${pointer} ${checkbox} ${item.name}${reset}${updateFlag} ${highlight}${expandIcon} ${shortDesc}${reset}`);
        }
      });

      const selectedCount = selected.size;
      const updateCount = Array.from(selected).filter(id => itemsNeedingUpdate.has(id)).length;
      const updateNote = updateCount > 0 ? ` (${updateCount} to update)` : '';
      console.log(`\n${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected${updateNote}`);
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
          cursor = cursor > 0 ? cursor - 1 : items.length - 1;
          render();
          break;
        case 'down':
          cursor = cursor < items.length - 1 ? cursor + 1 : 0;
          render();
          break;
        case 'right':
          const currentItem = items[cursor];
          expanded.add(currentItem.id);
          if (metadataLoader && !metadataCache.has(currentItem.id) && !metadataLoading.has(currentItem.id)) {
            metadataLoading.add(currentItem.id);
            render();
            metadataLoader(currentItem.id)
              .then((metadata) => {
                if (metadata?.name) {
                  currentItem.name = metadata.name;
                }
                if (metadata?.description) {
                  currentItem.description = metadata.description;
                } else if (!currentItem.description || currentItem.description === 'Press right arrow to load description') {
                  currentItem.description = 'Description unavailable';
                }
              })
              .catch(() => {
                if (!currentItem.description || currentItem.description === 'Press right arrow to load description') {
                  currentItem.description = 'Description unavailable (metadata fetch failed)';
                }
              })
              .finally(() => {
                metadataLoading.delete(currentItem.id);
                metadataCache.add(currentItem.id);
                render();
              });
          }
          render();
          break;
        case 'left':
          expanded.delete(items[cursor].id);
          render();
          break;
        case 'space':
          const itemId = items[cursor].id;
          if (selected.has(itemId)) {
            selected.delete(itemId);
          } else {
            selected.add(itemId);
          }
          render();
          break;
        case 'a':
          // Toggle all
          if (selected.size === items.length) {
            selected.clear();
          } else {
            items.forEach(item => selected.add(item.id));
          }
          render();
          break;
        case 'return':
          if (selected.size === 0) {
            // Show error inline
            process.stdout.write('\x1B[31mPlease select at least one item\x1B[0m');
            setTimeout(render, 1000);
          } else {
            cleanup();
            // Clear and show final selection
            process.stdout.write('\x1B[2J\x1B[H');
            console.log(`\n${title.split(' ')[0]} Selected:`);
            items.filter(item => selected.has(item.id)).forEach(item => {
              console.log(`   ✓ ${item.name}`);
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
 * Display success message for subagent installation
 * @param {string} installPath - Where subagents were installed
 * @param {string[]} installedAgents - List of installed subagent names
 */
export function showSubagentSuccess(installPath, installedAgents) {
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Subagents installed successfully!');
  console.log('═'.repeat(50));
  console.log(`\n📁 Location: ${installPath}`);
  console.log(`\n🤖 Installed subagents (${installedAgents.length}):`);
  installedAgents.forEach(agent => console.log(`   • ${agent}`));
  console.log('\n🚀 Your AI agent will automatically discover these subagents.');
  console.log('═'.repeat(50) + '\n');
}

/**
 * Display error message
 * @param {string} message - Error message
 */
export function showError(message) {
  console.error(`\n❌ Error: ${message}\n`);
}
