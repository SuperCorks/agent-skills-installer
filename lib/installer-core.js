/**
 * Shared installer helpers used by both the interactive wizard and the non-interactive mode
 */

import { existsSync, appendFileSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { listCheckedOutSkills, listCheckedOutSubagents } from './git.js';
import { allAgentDetectionTargets, allSkillDetectionTargets, getAgentInstallMode } from './install-targets.js';
import { listInstalledCodexAgents } from './codex-agents.js';

export function resolveInstallPath(path) {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return resolve(homedir(), path.slice(2));
  return resolve(process.cwd(), path);
}

export function isHomePath(path) {
  return path === '~' || path.startsWith('~/');
}

/**
 * Detect existing skill installations in common paths
 * @returns {Promise<Array<{path: string, skillCount: number, skills: string[]}>>}
 */
export async function detectExistingSkillInstallations() {
  const installations = [];

  for (const { path } of allSkillDetectionTargets()) {
    const absolutePath = resolveInstallPath(path);
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
export async function detectExistingAgentInstallations() {
  const installations = [];

  for (const { path } of allAgentDetectionTargets()) {
    const absolutePath = resolveInstallPath(path);
    const installMode = getAgentInstallMode(path);

    if (installMode === 'codex-toml') {
      try {
        const agents = await listInstalledCodexAgents(absolutePath);
        if (agents.length > 0) {
          installations.push({
            path,
            agentCount: agents.length,
            agents
          });
        }
      } catch {
        // Ignore errors reading existing installations
      }
      continue;
    }

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
 * Check if a path is already in .gitignore
 * @param {string} gitignorePath - Path to .gitignore file
 * @param {string} pathToCheck - Path to check
 * @returns {boolean}
 */
export function isInGitignore(gitignorePath, pathToCheck) {
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
 * @param {(message: string) => void} log - Where to report what happened
 * @returns {boolean} Whether an entry was added
 */
export function addToGitignore(gitignorePath, pathToIgnore, log = console.log) {
  // Normalize the path for gitignore (remove trailing slash for consistency)
  const normalizedPath = pathToIgnore.replace(/\/$/, '');
  const gitignoreEntry = `\n# AI Agent Skills\n${normalizedPath}/\n`;

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes(normalizedPath)) {
      log(`ℹ️  "${normalizedPath}" is already in .gitignore`);
      return false;
    }
    appendFileSync(gitignorePath, gitignoreEntry);
  } else {
    writeFileSync(gitignorePath, gitignoreEntry.trim() + '\n');
  }
  log(`✅ Added "${normalizedPath}/" to .gitignore`);
  return true;
}
