/**
 * Git sparse-checkout utilities for cloning selected skills
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { getRepoUrl } from './skills.js';

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
  const absolutePath = resolve(targetPath);
  
  // Check if target already exists and has content
  if (existsSync(absolutePath)) {
    const gitDir = join(absolutePath, '.git');
    if (existsSync(gitDir)) {
      throw new Error(`Directory "${targetPath}" already contains a git repository. Please remove it first or choose a different path.`);
    }
  }

  // Create target directory
  mkdirSync(absolutePath, { recursive: true });

  try {
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

    // Initialize sparse-checkout in cone mode
    onProgress('Configuring sparse-checkout...');
    await runGitCommand([
      'sparse-checkout',
      'init',
      '--cone'
    ], absolutePath);

    // Set sparse-checkout to include only selected skill folders
    // Skills are at repo root level, so no prefix needed
    const sparsePatterns = skillFolders;
    
    onProgress('Setting up selected skills...');
    await runGitCommand([
      'sparse-checkout',
      'set',
      ...sparsePatterns
    ], absolutePath);

    // Checkout the files
    onProgress('Checking out files...');
    await runGitCommand(['checkout'], absolutePath);

    onProgress('Done!');
  } catch (error) {
    // Clean up on failure
    try {
      rmSync(absolutePath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Add more skills to an existing sparse-checkout
 * @param {string} repoPath - Path to the existing sparse-checkout repo
 * @param {string[]} skillFolders - Additional skill folders to add
 * @returns {Promise<void>}
 */
export async function addSkillsToSparseCheckout(repoPath, skillFolders) {
  const absolutePath = resolve(repoPath);
  
  if (!existsSync(join(absolutePath, '.git'))) {
    throw new Error(`"${repoPath}" is not a git repository`);
  }

  // Skills are at repo root level, so no prefix needed
  const newPatterns = skillFolders;
  
  await runGitCommand([
    'sparse-checkout',
    'add',
    ...newPatterns
  ], absolutePath);
}

/**
 * List currently checked out skills in a sparse-checkout repo
 * @param {string} repoPath - Path to the sparse-checkout repo
 * @returns {Promise<string[]>} List of skill folder names
 */
export async function listCheckedOutSkills(repoPath) {
  const absolutePath = resolve(repoPath);
  
  if (!existsSync(join(absolutePath, '.git'))) {
    throw new Error(`"${repoPath}" is not a git repository`);
  }

  const output = await runGitCommand(['sparse-checkout', 'list'], absolutePath);
  const patterns = output.split('\n').filter(Boolean);
  
  // Skills are at repo root, return all non-dotfile patterns
  return patterns.filter(p => !p.startsWith('.'));
}

/**
 * Pull latest changes in a sparse-checkout repo
 * @param {string} repoPath - Path to the sparse-checkout repo  
 * @returns {Promise<string>}
 */
export async function pullUpdates(repoPath) {
  const absolutePath = resolve(repoPath);
  return runGitCommand(['pull'], absolutePath);
}
