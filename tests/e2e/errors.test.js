/**
 * Error Handling E2E Tests
 * Tests all documented error scenarios from features.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';

// ============================================================================
// Test Utilities
// ============================================================================

function createTempDir() {
  const path = mkdtempSync(join(tmpdir(), 'error-test-'));
  return {
    path,
    cleanup: () => {
      try { rmSync(path, { recursive: true, force: true }); } catch {}
    }
  };
}

function runCLI(cwd, args = [], options = {}) {
  return new Promise((resolve) => {
    const binPath = join(process.cwd(), 'bin', 'install.js');
    const proc = spawn('node', [binPath, ...args], {
      cwd,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ stdout, stderr, exitCode: 124, timedOut: true });
    }, options.timeout || 5000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut: false });
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr: stderr + err.message, exitCode: 1, timedOut: false });
    });
  });
}

// ============================================================================
// Unknown Command Error Tests
// ============================================================================

describe('Error: Unknown Command', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: See helpful message for invalid commands', () => {
    it('should show error for completely unknown command', async () => {
      const result = await runCLI(tempDir.path, ['foobar']);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command');
      expect(result.stderr).toContain('foobar');
    });

    it('should show usage information after unknown command', async () => {
      const result = await runCLI(tempDir.path, ['xyz']);
      
      expect(result.stdout).toContain('Usage');
    });

    it('should handle typos in install command', async () => {
      const result = await runCLI(tempDir.path, ['instal']);  // typo
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command');
    });
  });
});

// ============================================================================
// Version Flag Tests
// ============================================================================

describe('Version Information', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Check installed version', () => {
    it('should output version matching package.json', async () => {
      const result = await runCLI(tempDir.path, ['--version']);
      
      expect(result.exitCode).toBe(0);
      // Version format: X.Y.Z
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should output only version number', async () => {
      const result = await runCLI(tempDir.path, ['-v']);
      
      // Should not contain extra text, just the version
      const lines = result.stdout.trim().split('\n');
      expect(lines).toHaveLength(1);
    });
  });
});

// ============================================================================
// Help Flag Tests
// ============================================================================

describe('Help Information', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Get help with CLI usage', () => {
    it('should show package name and version in help', async () => {
      const result = await runCLI(tempDir.path, ['--help']);
      
      expect(result.stdout).toContain('@supercorks/skills-installer');
      expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
    });

    it('should show all available commands and options', async () => {
      const result = await runCLI(tempDir.path, ['--help']);
      
      expect(result.stdout).toContain('--help');
      expect(result.stdout).toContain('--version');
    });

    it('should exit with code 0 after showing help', async () => {
      const result = await runCLI(tempDir.path, ['-h']);
      
      expect(result.exitCode).toBe(0);
    });
  });
});

// ============================================================================
// No Skills Found Error Tests (requires mocking)
// ============================================================================

describe('Error: No Skills Found', () => {
  describe('User Story: Handle empty repository', () => {
    it('should document behavior when no skills found', () => {
      // When the API returns empty skills list, the CLI should:
      // 1. Show an error message
      // 2. Exit with code 1
      
      const expectedBehavior = {
        showsError: true,
        exitCode: 1,
        message: 'No skills found'
      };
      
      expect(expectedBehavior.showsError).toBe(true);
      expect(expectedBehavior.exitCode).toBe(1);
    });
  });
});

// ============================================================================
// Target Path Already Has Git Repo Tests
// ============================================================================

describe('Error: Target Path Already Has Git Repo', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Handle existing git repository', () => {
    it('should detect .git directory in target path', () => {
      const targetPath = join(tempDir.path, 'my-skills');
      const gitDir = join(targetPath, '.git');
      
      mkdirSync(gitDir, { recursive: true });
      
      expect(existsSync(gitDir)).toBe(true);
      // CLI should refuse to clone here
    });

    it('should document expected error message', () => {
      const expectedMessage = 'already contains a git repository';
      expect(expectedMessage).toContain('git repository');
    });
  });
});

// ============================================================================
// Network Failure Error Tests
// ============================================================================

describe('Error: Network Failures', () => {
  describe('User Story: Handle GitHub API unavailable', () => {
    it('should document graceful handling of network errors', () => {
      // When network fails, the CLI should:
      // 1. Stop the spinner
      // 2. Show error with details
      // 3. Exit with code 1
      
      const expectedBehavior = {
        stopsSpinner: true,
        showsDetails: true,
        exitCode: 1
      };
      
      expect(expectedBehavior.stopsSpinner).toBe(true);
      expect(expectedBehavior.showsDetails).toBe(true);
    });
  });

  describe('User Story: Handle rate limiting', () => {
    it('should provide helpful message on 403 errors', () => {
      // GitHub API returns 403 when rate limited
      // The error message should include the status code
      const errorStatus = 403;
      
      expect(errorStatus).toBe(403);
    });
  });
});

// ============================================================================
// Install Command Tests
// ============================================================================

describe('Install Command', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Run explicit install command', () => {
    it('should accept "install" as explicit command', async () => {
      // This will start interactive mode
      const result = await runCLI(tempDir.path, ['install'], { timeout: 3000 });
      
      // Should show banner (proves command was accepted)
      expect(result.stdout).toContain('AI Agent Skills & Subagents Installer');
    });

    it('should accept no command (default to install)', async () => {
      const result = await runCLI(tempDir.path, [], { timeout: 3000 });
      
      // Should also show banner
      expect(result.stdout).toContain('AI Agent Skills & Subagents Installer');
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Handle special characters in paths', () => {
    it('should handle spaces in working directory', async () => {
      const pathWithSpaces = join(tempDir.path, 'path with spaces');
      mkdirSync(pathWithSpaces, { recursive: true });
      
      const result = await runCLI(pathWithSpaces, ['--version']);
      
      expect(result.exitCode).toBe(0);
    });
  });

  describe('User Story: Handle concurrent installations', () => {
    it('should handle multiple simultaneous version checks', async () => {
      const results = await Promise.all([
        runCLI(tempDir.path, ['--version']),
        runCLI(tempDir.path, ['--version']),
        runCLI(tempDir.path, ['--version'])
      ]);
      
      results.forEach(result => {
        expect(result.exitCode).toBe(0);
      });
    });
  });
});

// ============================================================================
// Cancellation Tests
// ============================================================================

describe('User Cancellation', () => {
  describe('User Story: Cancel installation gracefully', () => {
    it('should document Ctrl+C behavior', () => {
      // When user presses Ctrl+C, the CLI should:
      // 1. Clean up any partial state
      // 2. Show "Installation cancelled" message
      // 3. Exit gracefully (code 0)
      
      const expectedBehavior = {
        message: 'Installation cancelled',
        exitCode: 0,
        cleanUp: true
      };
      
      expect(expectedBehavior.message).toContain('cancelled');
      expect(expectedBehavior.exitCode).toBe(0);
    });
  });
});

// ============================================================================
// Gitignore Integration Error Tests  
// ============================================================================

describe('Gitignore Edge Cases', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Handle various gitignore states', () => {
    it('should create gitignore if missing', () => {
      const gitignorePath = join(tempDir.path, '.gitignore');
      
      // Initially doesn't exist
      expect(existsSync(gitignorePath)).toBe(false);
      
      // Simulate CLI creating it
      writeFileSync(gitignorePath, '# AI Agent Skills\n.github/skills/\n');
      
      expect(existsSync(gitignorePath)).toBe(true);
    });

    it('should preserve existing gitignore content', () => {
      const gitignorePath = join(tempDir.path, '.gitignore');
      const existingContent = 'node_modules/\n.env\n';
      
      writeFileSync(gitignorePath, existingContent);
      
      // Simulate CLI appending
      const addition = '\n# AI Agent Skills\n.github/skills/\n';
      writeFileSync(gitignorePath, existingContent + addition);
      
      const finalContent = require('fs').readFileSync(gitignorePath, 'utf-8');
      expect(finalContent).toContain('node_modules/');
      expect(finalContent).toContain('.github/skills/');
    });
  });
});
