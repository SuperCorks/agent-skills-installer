/**
 * E2E tests for the non-interactive mode of the CLI
 * Only covers paths that need no network access.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';

function runCLI(cwd, args = [], options = {}) {
  return new Promise((resolve) => {
    const binPath = join(process.cwd(), 'bin', 'install.js');
    const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ...options.env };
    delete env.SKILLS_INSTALLER_FORCE_INTERACTIVE;

    const proc = spawn('node', [binPath, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });

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
  });
}

describe('Non-Interactive CLI', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'skills-installer-cli-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('User Story: Never hang waiting for a prompt', () => {
    it('should exit with a usage error when there is no terminal and no flags', async () => {
      const result = await runCLI(tempDir, []);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('No interactive terminal detected');
      expect(result.stderr).toContain('--list --json');
    });

    it('should do the same for the explicit install command', async () => {
      const result = await runCLI(tempDir, ['install']);

      expect(result.timedOut).toBe(false);
      expect(result.exitCode).toBe(2);
    });
  });

  describe('User Story: Understand usage errors', () => {
    it('should exit 2 with a readable message', async () => {
      const result = await runCLI(tempDir, ['install', '--yes', '--skills', 'docs']);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('--path is required');
      expect(result.stderr).toContain('--help');
    });

    it('should print usage errors as JSON on stdout with --json', async () => {
      const result = await runCLI(tempDir, ['install', '--json', '--update']);

      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout)).toEqual({
        ok: false,
        error: { code: 'USAGE', message: '--update needs --path, --agents-path or --all.' }
      });
    });

    it('should reject unknown flags', async () => {
      const result = await runCLI(tempDir, ['--bogus']);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain('--bogus');
    });

    it('should still reject unknown commands with exit code 1', async () => {
      const result = await runCLI(tempDir, ['foobar', '--yes']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command: foobar');
    });
  });

  describe('User Story: Fail without network access to anything', () => {
    it('should report a missing installation for --update as JSON', async () => {
      const result = await runCLI(tempDir, ['install', '--update', '--path', join(tempDir, 'missing'), '--json']);

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, error: { code: 'NOT_INSTALLED' } });
    });
  });

  describe('User Story: Find the non-interactive flags', () => {
    it('should document them in --help', async () => {
      const result = await runCLI(tempDir, ['--help']);

      expect(result.exitCode).toBe(0);
      for (const flag of ['--list', '--skills', '--agents', '--remove-skills', '--remove-agents', '--exact', '--path', '--agents-path', '--update', '--all', '--dry-run', '--gitignore', '--json', '--yes']) {
        expect(result.stdout).toContain(flag);
      }
      expect(result.stdout).toContain('Exit codes');
    });
  });
});
