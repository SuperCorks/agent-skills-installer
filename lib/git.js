/**
 * Git sparse-checkout utilities for cloning selected skills
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, appendFileSync } from 'fs';
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

    // Use non-cone mode for precise control over what's checked out
    // This prevents root-level files (README.md, etc.) from being included
    onProgress('Configuring sparse-checkout...');
    await runGitCommand([
      'sparse-checkout',
      'init',
      '--no-cone'
    ], absolutePath);

    // Write explicit patterns - only skill folders, no root files
    // Format: /folder/* includes everything in that folder recursively
    const sparseCheckoutPath = join(absolutePath, '.git', 'info', 'sparse-checkout');
    const patterns = skillFolders.map(folder => `/${folder}/`).join('\n');
    writeFileSync(sparseCheckoutPath, patterns + '\n');

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
 * Update the sparse-checkout to include exactly the specified skills
 * This replaces all existing skills with the new selection
 * @param {string} repoPath - Path to the existing sparse-checkout repo
 * @param {string[]} skillFolders - Skill folders to include (replaces existing)
 * @param {(message: string) => void} onProgress - Progress callback
 * @returns {Promise<void>}
 */
export async function updateSparseCheckout(repoPath, skillFolders, onProgress = () => {}) {
  const absolutePath = resolve(repoPath);
  
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
  const absolutePath = resolve(repoPath);
  
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
  const absolutePath = resolve(repoPath);
  
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
  const absolutePath = resolve(repoPath);
  return runGitCommand(['pull'], absolutePath);
}
