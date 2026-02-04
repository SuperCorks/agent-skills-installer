/**
 * Test utilities for E2E testing the skills-installer CLI
 */

import { spawn } from 'child_process';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Create an isolated temp directory for test execution
 * @returns {{ path: string, cleanup: () => void }}
 */
export function createTempDir() {
  const path = mkdtempSync(join(tmpdir(), 'skills-installer-test-'));
  return {
    path,
    cleanup: () => {
      try {
        rmSync(path, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  };
}

/**
 * Create a mock .git directory with sparse-checkout config
 * @param {string} basePath - Base directory for the mock repo
 * @param {string[]} skills - Skills to include in sparse-checkout
 */
export function createMockSkillsRepo(basePath, skills = []) {
  const gitDir = join(basePath, '.git');
  const infoDir = join(gitDir, 'info');
  
  mkdirSync(gitDir, { recursive: true });
  mkdirSync(infoDir, { recursive: true });
  
  // Write sparse-checkout config
  const patterns = skills.map(s => `/${s}/`).join('\n');
  writeFileSync(join(infoDir, 'sparse-checkout'), patterns + '\n');
  
  // Create minimal git config
  writeFileSync(join(gitDir, 'config'), `[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
`);

  // Create skill directories
  skills.forEach(skill => {
    const skillDir = join(basePath, skill);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), `---
name: ${skill}
description: Test skill ${skill}
---
# ${skill}
`);
  });
}

/**
 * Create a mock .gitignore file
 * @param {string} basePath - Base directory
 * @param {string} content - Content to write
 */
export function createGitignore(basePath, content = '') {
  writeFileSync(join(basePath, '.gitignore'), content);
}

/**
 * Read the .gitignore file
 * @param {string} basePath - Base directory
 * @returns {string|null}
 */
export function readGitignore(basePath) {
  const path = join(basePath, '.gitignore');
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

/**
 * Run the CLI with simulated keypresses
 * @param {string} cwd - Working directory
 * @param {string[]} args - CLI arguments
 * @param {string[]} inputs - Array of inputs to send (keys/text followed by enter)
 * @param {object} options - Additional options
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
export function runCLI(cwd, args = [], inputs = [], options = {}) {
  return new Promise((resolve) => {
    const binPath = join(process.cwd(), 'bin', 'install.js');
    const proc = spawn('node', [binPath, ...args], {
      cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let inputIndex = 0;

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      
      // Send next input when we see a prompt indicator
      if (inputIndex < inputs.length) {
        const input = inputs[inputIndex];
        if (input !== null) {
          setTimeout(() => {
            proc.stdin.write(input);
            inputIndex++;
          }, 100);
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });

    proc.on('error', (err) => {
      stderr += err.message;
      resolve({ stdout, stderr, exitCode: 1 });
    });

    // Timeout safety
    setTimeout(() => {
      proc.kill('SIGTERM');
    }, options.timeout || 10000);
  });
}

/**
 * Mock GitHub API responses for skill fetching
 * Creates a mock server response structure
 */
export const mockGitHubSkills = [
  {
    folder: 'address-pr-comments',
    name: 'Address PR Comments',
    description: 'Address PR review comments from automated and human reviewers.'
  },
  {
    folder: 'gtm-manager',
    name: 'GTM Manager',
    description: 'Manage Google Tag Manager containers, tags, triggers, and variables.'
  },
  {
    folder: 'test-skill',
    name: 'Test Skill',
    description: 'A test skill for testing purposes.'
  }
];

/**
 * Create mock GitHub API responses  
 * @param {Array} skills - Skills to include in the mock
 * @returns {object} Mock fetch responses
 */
export function createMockGitHubResponses(skills = mockGitHubSkills) {
  // Root contents response
  const rootContents = skills.map(s => ({
    name: s.folder,
    path: s.folder,
    type: 'dir'
  }));

  // SKILL.md responses for each skill
  const skillMdResponses = {};
  skills.forEach(s => {
    const content = `---
name: ${s.name}
description: ${s.description}
---
# ${s.name}
`;
    skillMdResponses[s.folder] = {
      content: Buffer.from(content).toString('base64')
    };
  });

  return { rootContents, skillMdResponses };
}
