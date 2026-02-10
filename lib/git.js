/**
 * Git sparse-checkout utilities for cloning selected skills and subagents
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { getRepoUrl } from './skills.js';
import { getSubagentsRepoUrl } from './subagents.js';

function resolvePath(path) {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return resolve(homedir(), path.slice(2));
  return resolve(path);
}

/**
 * Check if git is available
 * @returns {boolean}
 */
export function isGitAvailable() {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Execute a git command and return the result
 * @param {string[]} args - Git command arguments
 * @param {string} cwd - Working directory
 * @returns {Promise<string>}
 */
function runGitCommand(args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, { 
      cwd, 
      stdio: ['ignore', 'pipe', 'pipe'] 
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr || `Git command failed with code ${code}`));
      }
    });
    
    proc.on('error', reject);
  });
}

async function getDefaultRemoteBranch(cwd) {
  try {
    const output = await runGitCommand(['ls-remote', '--symref', 'origin', 'HEAD'], cwd);
    const match = output.match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/);
    return match?.[1] || 'main';
  } catch {
    return 'main';
  }
}

async function configureSparseCheckout(cwd, patterns) {
  await runGitCommand(['sparse-checkout', 'init', '--no-cone'], cwd);
  const sparseCheckoutPath = join(cwd, '.git', 'info', 'sparse-checkout');
  writeFileSync(sparseCheckoutPath, patterns + '\n');
}

async function initializeRepoInExistingDirectory(cwd, repoUrl, patterns, onProgress) {
  onProgress('Initializing git repository in existing directory...');
  await runGitCommand(['init'], cwd);

  try {
    await runGitCommand(['remote', 'set-url', 'origin', repoUrl], cwd);
  } catch {
    await runGitCommand(['remote', 'add', 'origin', repoUrl], cwd);
  }

  onProgress('Fetching repository...');
  await runGitCommand(['fetch', 'origin'], cwd);

  onProgress('Configuring sparse-checkout...');
  await configureSparseCheckout(cwd, patterns);

  const defaultBranch = await getDefaultRemoteBranch(cwd);

  onProgress('Checking out files...');
  await runGitCommand(['checkout', '-B', defaultBranch, `origin/${defaultBranch}`], cwd);
}

/**
 * Perform a sparse clone of the repository with only selected skills
 * This method preserves full git history and allows push capability
 * 
 * @param {string} targetPath - Where to clone the repository
 * @param {string[]} skillFolders - Array of skill folder names to include
 * @param {(message: string) => void} onProgress - Progress callback
 * @returns {Promise<void>}
 */
export async function sparseCloneSkills(targetPath, skillFolders, onProgress = () => {}) {
  const repoUrl = getRepoUrl();
  const absolutePath = resolvePath(targetPath);
  const existedBefore = existsSync(absolutePath);
  const patterns = skillFolders.map(folder => `/${folder}/`).join('\n');
  let shouldAdoptExistingDirectory = false;
  
  // Check if target already exists and has content
  if (existedBefore) {
    const gitDir = join(absolutePath, '.git');
    if (existsSync(gitDir)) {
      throw new Error(`Directory "${targetPath}" already contains a git repository. Please remove it first or choose a different path.`);
    }
    const entries = readdirSync(absolutePath).filter(name => name !== '.DS_Store');
    if (entries.length > 0) {
      shouldAdoptExistingDirectory = true;
    }
  }

  // Create target directory
  mkdirSync(absolutePath, { recursive: true });

  try {
    if (shouldAdoptExistingDirectory) {
      await initializeRepoInExistingDirectory(absolutePath, repoUrl, patterns, onProgress);
    } else {
      // Clone with blob filter for minimal download, no checkout yet
      onProgress('Initializing sparse clone...');
      await runGitCommand([
        'clone',
        '--filter=blob:none',
        '--no-checkout',
        '--sparse',
        repoUrl,
        '.'
      ], absolutePath);

      // Use non-cone mode for precise control over what's checked out
      // This prevents root-level files (README.md, etc.) from being included
      onProgress('Configuring sparse-checkout...');
      await configureSparseCheckout(absolutePath, patterns);

      // Checkout the files
      onProgress('Checking out files...');
      await runGitCommand(['checkout'], absolutePath);
    }

    onProgress('Done!');
  } catch (error) {
    // Clean up on failure
    if (!existedBefore) {
      try {
        rmSync(absolutePath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Update the sparse-checkout to include exactly the specified skills
 * This replaces all existing skills with the new selection
 * @param {string} repoPath - Path to the existing sparse-checkout repo
 * @param {string[]} skillFolders - Skill folders to include (replaces existing)
 * @param {(message: string) => void} onProgress - Progress callback
 * @returns {Promise<void>}
 */
export async function updateSparseCheckout(repoPath, skillFolders, onProgress = () => {}) {
  const absolutePath = resolvePath(repoPath);
  
  if (!existsSync(join(absolutePath, '.git'))) {
    throw new Error(`"${repoPath}" is not a git repository`);
  }

  // Pull latest changes first
  onProgress('Pulling latest changes...');
  try {
    await runGitCommand(['pull'], absolutePath);
  } catch (error) {
    // Ignore pull errors (e.g., no upstream configured)
  }

  // Write new patterns to sparse-checkout file (replaces existing)
  onProgress('Updating sparse-checkout configuration...');
  const sparseCheckoutPath = join(absolutePath, '.git', 'info', 'sparse-checkout');
  const patterns = skillFolders.map(folder => `/${folder}/`).join('\n');
  writeFileSync(sparseCheckoutPath, patterns + '\n');
  
  // Re-apply sparse-checkout
  onProgress('Applying changes...');
  await runGitCommand(['read-tree', '-mu', 'HEAD'], absolutePath);
  
  onProgress('Done!');
}

/**
 * Add more skills to an existing sparse-checkout
 * @param {string} repoPath - Path to the existing sparse-checkout repo
 * @param {string[]} skillFolders - Additional skill folders to add
 * @returns {Promise<void>}
 */
export async function addSkillsToSparseCheckout(repoPath, skillFolders) {
  const absolutePath = resolvePath(repoPath);
  
  if (!existsSync(join(absolutePath, '.git'))) {
    throw new Error(`"${repoPath}" is not a git repository`);
  }

  // Append new patterns to sparse-checkout file (non-cone mode format)
  const sparseCheckoutPath = join(absolutePath, '.git', 'info', 'sparse-checkout');
  const newPatterns = skillFolders.map(folder => `/${folder}/`).join('\n');
  appendFileSync(sparseCheckoutPath, newPatterns + '\n');
  
  // Re-apply sparse-checkout
  await runGitCommand(['read-tree', '-mu', 'HEAD'], absolutePath);
}

/**
 * List currently checked out skills in a sparse-checkout repo
 * @param {string} repoPath - Path to the sparse-checkout repo
 * @returns {Promise<string[]>} List of skill folder names
 */
export async function listCheckedOutSkills(repoPath) {
  const absolutePath = resolvePath(repoPath);
  
  if (!existsSync(join(absolutePath, '.git'))) {
    throw new Error(`"${repoPath}" is not a git repository`);
  }

  // Read patterns from sparse-checkout file (non-cone mode format: /folder/)
  const sparseCheckoutPath = join(absolutePath, '.git', 'info', 'sparse-checkout');
  if (!existsSync(sparseCheckoutPath)) {
    return [];
  }
  
  const content = readFileSync(sparseCheckoutPath, 'utf-8');
  const patterns = content.split('\n').filter(Boolean);
  
  // Extract folder names from patterns like /folder/
  return patterns
    .map(p => p.replace(/^\/|\/$/g, ''))  // Remove leading/trailing slashes
    .filter(p => p && !p.startsWith('.'));
}

/**
 * Pull latest changes in a sparse-checkout repo
 * @param {string} repoPath - Path to the sparse-checkout repo  
 * @returns {Promise<string>}
 */
export async function pullUpdates(repoPath) {
  const absolutePath = resolvePath(repoPath);
  return runGitCommand(['pull'], absolutePath);
}

/**
 * Check which skills have updates available (local differs from remote)
 * @param {string} repoPath - Path to the sparse-checkout repo
 * @param {string[]} skillFolders - Skill folders to check
 * @returns {Promise<Set<string>>} Set of skill folder names that need updates
 */
export async function checkSkillsForUpdates(repoPath, skillFolders) {
  const absolutePath = resolvePath(repoPath);
  const needsUpdate = new Set();
  
  if (!existsSync(join(absolutePath, '.git'))) {
    return needsUpdate;
  }

  try {
    // Fetch latest from remote without modifying working tree
    await runGitCommand(['fetch', 'origin'], absolutePath);
    
    // Get current branch
    const branch = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], absolutePath);
    
    // For each skill, check if there are differences between local and remote
    for (const folder of skillFolders) {
      try {
        // Check if remote has changes for this folder
        const diff = await runGitCommand([
          'diff', 
          `HEAD..origin/${branch}`,
          '--stat',
          '--',
          folder
        ], absolutePath);
        
        if (diff.trim()) {
          needsUpdate.add(folder);
        }
      } catch {
        // If diff fails, skip this folder
      }
    }
  } catch {
    // If fetch fails, return empty set (can't determine updates)
  }
  
  return needsUpdate;
}

/**
 * Check which subagents have updates available (local differs from remote)
 * @param {string} repoPath - Path to the sparse-checkout repo
 * @param {string[]} agentFilenames - Agent filenames to check
 * @returns {Promise<Set<string>>} Set of agent filenames that need updates
 */
export async function checkSubagentsForUpdates(repoPath, agentFilenames) {
  const absolutePath = resolvePath(repoPath);
  const needsUpdate = new Set();
  
  if (!existsSync(join(absolutePath, '.git'))) {
    return needsUpdate;
  }

  try {
    // Fetch latest from remote without modifying working tree
    await runGitCommand(['fetch', 'origin'], absolutePath);
    
    // Get current branch
    const branch = await runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], absolutePath);
    
    // For each agent, check if there are differences between local and remote
    for (const filename of agentFilenames) {
      try {
        // Check if remote has changes for this file
        const diff = await runGitCommand([
          'diff', 
          `HEAD..origin/${branch}`,
          '--stat',
          '--',
          filename
        ], absolutePath);
        
        if (diff.trim()) {
          needsUpdate.add(filename);
        }
      } catch {
        // If diff fails, skip this file
      }
    }
  } catch {
    // If fetch fails, return empty set (can't determine updates)
  }
  
  return needsUpdate;
}

// ==================== SUBAGENTS FUNCTIONS ====================

/**
 * Perform a sparse clone of the subagents repository with only selected agent files
 * 
 * @param {string} targetPath - Where to clone the repository
 * @param {string[]} agentFilenames - Array of agent filenames to include (e.g., 'Developer.agent.md')
 * @param {(message: string) => void} onProgress - Progress callback
 * @returns {Promise<void>}
 */
export async function sparseCloneSubagents(targetPath, agentFilenames, onProgress = () => {}) {
  const repoUrl = getSubagentsRepoUrl();
  const absolutePath = resolvePath(targetPath);
  const existedBefore = existsSync(absolutePath);
  const patterns = agentFilenames.map(filename => `/${filename}`).join('\n');
  let shouldAdoptExistingDirectory = false;
  
  // Check if target already exists and has content
  if (existedBefore) {
    const gitDir = join(absolutePath, '.git');
    if (existsSync(gitDir)) {
      throw new Error(`Directory "${targetPath}" already contains a git repository. Please remove it first or choose a different path.`);
    }
    const entries = readdirSync(absolutePath).filter(name => name !== '.DS_Store');
    if (entries.length > 0) {
      shouldAdoptExistingDirectory = true;
    }
  }

  // Create target directory
  mkdirSync(absolutePath, { recursive: true });

  try {
    if (shouldAdoptExistingDirectory) {
      await initializeRepoInExistingDirectory(absolutePath, repoUrl, patterns, onProgress);
    } else {
      // Clone with blob filter for minimal download, no checkout yet
      onProgress('Initializing sparse clone...');
      await runGitCommand([
        'clone',
        '--filter=blob:none',
        '--no-checkout',
        '--sparse',
        repoUrl,
        '.'
      ], absolutePath);

      // Use non-cone mode for precise control over what's checked out
      onProgress('Configuring sparse-checkout...');
      await configureSparseCheckout(absolutePath, patterns);

      // Checkout the files
      onProgress('Checking out files...');
      await runGitCommand(['checkout'], absolutePath);
    }

    onProgress('Done!');
  } catch (error) {
    // Clean up on failure
    if (!existedBefore) {
      try {
        rmSync(absolutePath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Update the sparse-checkout for subagents to include exactly the specified agents
 * @param {string} repoPath - Path to the existing sparse-checkout repo
 * @param {string[]} agentFilenames - Agent filenames to include (replaces existing)
 * @param {(message: string) => void} onProgress - Progress callback
 * @returns {Promise<void>}
 */
export async function updateSubagentsSparseCheckout(repoPath, agentFilenames, onProgress = () => {}) {
  const absolutePath = resolvePath(repoPath);
  
  if (!existsSync(join(absolutePath, '.git'))) {
    throw new Error(`"${repoPath}" is not a git repository`);
  }

  // Pull latest changes first
  onProgress('Pulling latest changes...');
  try {
    await runGitCommand(['pull'], absolutePath);
  } catch (error) {
    // Ignore pull errors (e.g., no upstream configured)
  }

  // Write new patterns to sparse-checkout file (replaces existing)
  onProgress('Updating sparse-checkout configuration...');
  const sparseCheckoutPath = join(absolutePath, '.git', 'info', 'sparse-checkout');
  const patterns = agentFilenames.map(filename => `/${filename}`).join('\n');
  writeFileSync(sparseCheckoutPath, patterns + '\n');
  
  // Re-apply sparse-checkout
  onProgress('Applying changes...');
  await runGitCommand(['read-tree', '-mu', 'HEAD'], absolutePath);
  
  onProgress('Done!');
}

/**
 * List currently checked out subagents in a sparse-checkout repo
 * @param {string} repoPath - Path to the sparse-checkout repo
 * @returns {Promise<string[]>} List of agent filenames
 */
export async function listCheckedOutSubagents(repoPath) {
  const absolutePath = resolvePath(repoPath);
  
  if (!existsSync(join(absolutePath, '.git'))) {
    throw new Error(`"${repoPath}" is not a git repository`);
  }

  // Read patterns from sparse-checkout file (non-cone mode format: /filename)
  const sparseCheckoutPath = join(absolutePath, '.git', 'info', 'sparse-checkout');
  if (!existsSync(sparseCheckoutPath)) {
    return [];
  }
  
  const content = readFileSync(sparseCheckoutPath, 'utf-8');
  const patterns = content.split('\n').filter(Boolean);
  
  // Extract filenames from patterns like /Developer.agent.md
  return patterns
    .map(p => p.replace(/^\//, ''))  // Remove leading slash
    .filter(p => p && p.endsWith('.agent.md'));
}
