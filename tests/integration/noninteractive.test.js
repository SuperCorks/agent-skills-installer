/**
 * Tests for lib/noninteractive.js
 * Git and GitHub access is replaced with fakes; the filesystem is a temp directory.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { EXIT_CODES, parseCliArgs } from '../../lib/cli-args.js';
import {
  InstallError,
  computeDesiredItems,
  errorToReport,
  formatReport,
  resolveNames,
  runNonInteractive
} from '../../lib/noninteractive.js';

const SKILLS_ORIGIN = 'https://github.com/supercorks/agent-skills.git';
const AGENTS_ORIGIN = 'git@github.com:SuperCorks/subagents.git';

const AVAILABLE_SKILLS = ['docs', 'feature-dev', 'frontend-design', 'kernel'];
const AVAILABLE_AGENTS = ['Architect.agent.md', 'Code Quality.agent.md', 'Tester.agent.md'];

let tempDir;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'skills-installer-noninteractive-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

function createExistingRepo(name) {
  const path = join(tempDir, name);
  mkdirSync(join(path, '.git'), { recursive: true });
  return path;
}

function createDeps({ installed = [], origin = SKILLS_ORIGIN, updateError = null, dirty = [] } = {}) {
  const calls = [];
  const record = name => async (...args) => {
    calls.push([name, ...args.filter(arg => typeof arg !== 'function')]);
  };
  const update = name => async (...args) => {
    calls.push([name, ...args.filter(arg => typeof arg !== 'function')]);
    if (updateError) throw new Error(updateError);
  };

  return {
    calls,
    deps: {
      fetchAvailableSkills: async () => AVAILABLE_SKILLS.map(folder => ({ folder })),
      fetchAvailableSubagents: async () => AVAILABLE_AGENTS.map(filename => ({ filename })),
      listCheckedOutSkills: async () => installed,
      listCheckedOutSubagents: async () => installed,
      listInstalledCodexAgents: async () => installed,
      sparseCloneSkills: record('sparseCloneSkills'),
      sparseCloneSubagents: record('sparseCloneSubagents'),
      updateSparseCheckout: update('updateSparseCheckout'),
      updateSubagentsSparseCheckout: update('updateSubagentsSparseCheckout'),
      syncCodexAgents: update('syncCodexAgents'),
      checkSkillsForUpdates: async () => new Set(),
      checkSubagentsForUpdates: async () => new Set(),
      checkCodexAgentUpdates: async () => new Set(),
      checkSkillsForDirtyChanges: async () => new Set(dirty),
      checkSubagentsForDirtyChanges: async () => new Set(dirty),
      getOriginUrl: async () => origin,
      isInsideGitWorkTree: () => false
    }
  };
}

function run(argv, deps) {
  return runNonInteractive(parseCliArgs(argv).options, deps);
}

async function failure(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the command to fail');
}

describe('Non-Interactive Helpers', () => {
  describe('User Story: Refer to items loosely', () => {
    it('should match names regardless of case, separators and the .agent.md suffix', () => {
      const { matched, unknown } = resolveNames(['code-quality', 'ARCHITECT', 'Tester.agent.md', 'nope'], AVAILABLE_AGENTS);

      expect(matched).toEqual(['Code Quality.agent.md', 'Architect.agent.md', 'Tester.agent.md']);
      expect(unknown).toEqual(['nope']);
    });

    it('should drop duplicate matches', () => {
      expect(resolveNames(['docs', 'Docs'], AVAILABLE_SKILLS).matched).toEqual(['docs']);
    });
  });

  describe('User Story: Change a selection additively', () => {
    it('should add without removing anything', () => {
      expect(computeDesiredItems({ installed: ['docs'], add: ['kernel', 'docs'], remove: [], exact: false })).toEqual({
        desired: ['docs', 'kernel'],
        added: ['kernel'],
        removed: []
      });
    });

    it('should remove only the named items', () => {
      expect(computeDesiredItems({ installed: ['docs', 'kernel'], add: [], remove: ['kernel'], exact: false })).toEqual({
        desired: ['docs'],
        added: [],
        removed: ['kernel']
      });
    });

    it('should replace the set with --exact', () => {
      expect(computeDesiredItems({ installed: ['docs', 'kernel'], add: ['kernel', 'feature-dev'], remove: [], exact: true })).toEqual({
        desired: ['kernel', 'feature-dev'],
        added: ['feature-dev'],
        removed: ['docs']
      });
    });
  });
});

describe('Non-Interactive Install', () => {
  describe('User Story: Install skills into a new location', () => {
    it('should sparse clone the requested skills', async () => {
      const { deps, calls } = createDeps();
      const path = join(tempDir, 'skills');

      const report = await run(['--yes', '--skills', 'Docs,feature-dev', '--path', path], deps);

      expect(calls).toEqual([['sparseCloneSkills', path, ['docs', 'feature-dev']]]);
      expect(report).toMatchObject({
        ok: true,
        dryRun: false,
        results: [{ kind: 'skills', path, action: 'installed', added: ['docs', 'feature-dev'], removed: [], installed: ['docs', 'feature-dev'] }]
      });
    });

    it('should install every available skill with "all"', async () => {
      const { deps, calls } = createDeps();

      await run(['--skills', 'all', '--path', join(tempDir, 'skills')], deps);

      expect(calls[0][2]).toEqual(AVAILABLE_SKILLS);
    });

    it('should apply the same selection to every --path', async () => {
      const { deps, calls } = createDeps();

      const report = await run(['--skills', 'docs', '--path', join(tempDir, 'a'), '--path', join(tempDir, 'b')], deps);

      expect(calls.map(call => call[1])).toEqual([join(tempDir, 'a'), join(tempDir, 'b')]);
      expect(report.results).toHaveLength(2);
    });

    it('should reject unknown skills before touching disk', async () => {
      const { deps, calls } = createDeps();

      const error = await failure(run(['--skills', 'docs,nope', '--path', join(tempDir, 'skills')], deps));

      expect(error).toBeInstanceOf(InstallError);
      expect(error.code).toBe('UNKNOWN_ITEM');
      expect(error.exitCode).toBe(EXIT_CODES.USAGE);
      expect(error.details.unknown).toEqual(['nope']);
      expect(error.details.available).toEqual(AVAILABLE_SKILLS);
      expect(calls).toEqual([]);
    });

    it('should report the plan without touching disk on --dry-run', async () => {
      const { deps, calls } = createDeps();

      const report = await run(['--skills', 'docs', '--path', join(tempDir, 'skills'), '--dry-run'], deps);

      expect(calls).toEqual([]);
      expect(report.dryRun).toBe(true);
      expect(report.results[0]).toMatchObject({ action: 'would-install', added: ['docs'] });
    });
  });

  describe('User Story: Change an existing installation additively', () => {
    it('should keep installed skills when adding new ones', async () => {
      const path = createExistingRepo('skills');
      const { deps, calls } = createDeps({ installed: ['docs', 'kernel'] });

      const report = await run(['--skills', 'feature-dev', '--path', path], deps);

      expect(calls).toEqual([['updateSparseCheckout', path, ['docs', 'kernel', 'feature-dev']]]);
      expect(report.results[0]).toMatchObject({ action: 'updated', added: ['feature-dev'], removed: [] });
    });

    it('should not touch an installation that already has the requested skills', async () => {
      const path = createExistingRepo('skills');
      const { deps, calls } = createDeps({ installed: ['docs', 'kernel'] });

      const report = await run(['--skills', 'docs', '--path', path], deps);

      expect(calls).toEqual([]);
      expect(report.results[0].action).toBe('unchanged');
    });

    it('should pull anyway when --update is passed', async () => {
      const path = createExistingRepo('skills');
      const { deps, calls } = createDeps({ installed: ['docs'] });

      const report = await run(['--skills', 'docs', '--path', path, '--update'], deps);

      expect(calls).toEqual([['updateSparseCheckout', path, ['docs']]]);
      expect(report.results[0].action).toBe('updated');
    });

    it('should remove named skills and report the ones that were not installed', async () => {
      const path = createExistingRepo('skills');
      const { deps, calls } = createDeps({ installed: ['docs', 'kernel'] });

      const report = await run(['--remove-skills', 'kernel,feature-dev', '--path', path], deps);

      expect(calls).toEqual([['updateSparseCheckout', path, ['docs']]]);
      expect(report.results[0]).toMatchObject({ removed: ['kernel'], notInstalled: ['feature-dev'], installed: ['docs'] });
    });

    it('should replace the installed set with --exact', async () => {
      const path = createExistingRepo('skills');
      const { deps, calls } = createDeps({ installed: ['docs', 'kernel'] });

      const report = await run(['--skills', 'kernel,feature-dev', '--exact', '--path', path], deps);

      expect(calls).toEqual([['updateSparseCheckout', path, ['kernel', 'feature-dev']]]);
      expect(report.results[0]).toMatchObject({ added: ['feature-dev'], removed: ['docs'] });
    });

    it('should refuse to remove the last skill', async () => {
      const path = createExistingRepo('skills');
      const { deps, calls } = createDeps({ installed: ['docs'] });

      const error = await failure(run(['--remove-skills', 'docs', '--path', path], deps));

      expect(error.code).toBe('EMPTY_SELECTION');
      expect(error.exitCode).toBe(EXIT_CODES.USAGE);
      expect(calls).toEqual([]);
    });

    it('should refuse to remove from a location with no installation', async () => {
      const { deps } = createDeps();

      const error = await failure(run(['--remove-skills', 'docs', '--path', join(tempDir, 'missing')], deps));

      expect(error.code).toBe('NOT_INSTALLED');
      expect(error.exitCode).toBe(EXIT_CODES.FAILURE);
    });
  });

  describe('User Story: Never rewrite an unrelated git repository', () => {
    it('should refuse a git repository whose origin is not the skills repo', async () => {
      const path = createExistingRepo('my-project');
      const { deps, calls } = createDeps({ origin: 'https://github.com/someone/my-project.git' });

      const error = await failure(run(['--skills', 'docs', '--path', path], deps));

      expect(error.code).toBe('NOT_AN_INSTALLATION');
      expect(calls).toEqual([]);
    });

    it('should refuse a skills repo used as an agents target', async () => {
      const path = createExistingRepo('skills');
      const { deps } = createDeps({ origin: SKILLS_ORIGIN });

      const error = await failure(run(['--agents', 'Architect', '--agents-path', path], deps));

      expect(error.code).toBe('NOT_AN_INSTALLATION');
    });
  });

  describe('User Story: Fail cleanly on local changes', () => {
    it('should report the dirty items and what already completed', async () => {
      const cleanPath = join(tempDir, 'fresh');
      const dirtyPath = createExistingRepo('dirty');
      const { deps } = createDeps({ installed: ['docs'], updateError: 'Your local changes would be overwritten', dirty: ['docs'] });

      const error = await failure(run(['--skills', 'kernel', '--path', cleanPath, '--path', dirtyPath], deps));

      expect(error.code).toBe('UPDATE_FAILED');
      expect(error.exitCode).toBe(EXIT_CODES.FAILURE);
      expect(error.details.dirty).toEqual(['docs']);
      expect(error.details.completed.map(result => result.path)).toEqual([cleanPath]);
      expect(errorToReport(error)).toMatchObject({
        ok: false,
        error: { code: 'UPDATE_FAILED', path: dirtyPath, dirty: ['docs'] }
      });
    });
  });

  describe('User Story: Install and update agents', () => {
    it('should use --path as the agents target when only agents are given', async () => {
      const { deps, calls } = createDeps();
      const path = join(tempDir, 'agents');

      await run(['--agents', 'architect,code-quality', '--path', path], deps);

      expect(calls).toEqual([['sparseCloneSubagents', path, ['Architect.agent.md', 'Code Quality.agent.md']]]);
    });

    it('should change skills and agents in one command', async () => {
      const { deps, calls } = createDeps();
      const skillsPath = join(tempDir, 'skills');
      const agentsPath = join(tempDir, 'agents');

      const report = await run(['--skills', 'docs', '--path', skillsPath, '--agents', 'Tester', '--agents-path', agentsPath], deps);

      expect(calls).toEqual([
        ['sparseCloneSkills', skillsPath, ['docs']],
        ['sparseCloneSubagents', agentsPath, ['Tester.agent.md']]
      ]);
      expect(report.results.map(result => result.kind)).toEqual(['skills', 'agents']);
    });

    it('should convert agents for Codex targets and keep the installed ones', async () => {
      const path = join(tempDir, '.codex', 'agents');
      const { deps, calls } = createDeps({ installed: ['Architect.agent.md'] });

      await run(['--agents', 'Tester', '--agents-path', path], deps);

      expect(calls).toEqual([['syncCodexAgents', path, ['Architect.agent.md', 'Tester.agent.md']]]);
    });

    it('should classify a bare --update --path by its origin', async () => {
      const path = createExistingRepo('agents');
      const { deps, calls } = createDeps({ installed: ['Architect.agent.md'], origin: AGENTS_ORIGIN });

      const report = await run(['--update', '--path', path], deps);

      expect(calls).toEqual([['updateSubagentsSparseCheckout', path, ['Architect.agent.md']]]);
      expect(report.results[0]).toMatchObject({ kind: 'agents', action: 'updated' });
    });

    it('should fail --update for a path with nothing installed', async () => {
      const { deps } = createDeps();

      const error = await failure(run(['--update', '--path', join(tempDir, 'missing')], deps));

      expect(error.code).toBe('NOT_INSTALLED');
    });
  });

  describe('User Story: Only touch .gitignore when asked', () => {
    beforeEach(() => {
      vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    });

    it('should leave .gitignore alone by default', async () => {
      const { deps } = createDeps();

      await run(['--skills', 'docs', '--path', '.claude/skills'], { ...deps, isInsideGitWorkTree: () => true });

      expect(existsSync(join(tempDir, '.gitignore'))).toBe(false);
    });

    it('should add a new local path with --gitignore', async () => {
      const { deps } = createDeps();

      const report = await run(['--skills', 'docs', '--path', '.claude/skills', '--gitignore'], { ...deps, isInsideGitWorkTree: () => true });

      expect(readFileSync(join(tempDir, '.gitignore'), 'utf-8')).toContain('.claude/skills/');
      expect(report.results[0].gitignoreUpdated).toBe(true);
    });

    it('should skip .gitignore outside a git work tree', async () => {
      const { deps } = createDeps();

      await run(['--skills', 'docs', '--path', '.claude/skills', '--gitignore'], deps);

      expect(existsSync(join(tempDir, '.gitignore'))).toBe(false);
    });
  });

  describe('User Story: Discover what can be installed', () => {
    it('should list available items and describe custom targets', async () => {
      const path = createExistingRepo('skills');
      const { deps, calls } = createDeps({ installed: ['docs'], dirty: ['docs'] });

      const report = await run(['--list', '--path', path], deps);

      expect(report.available).toEqual({ skills: AVAILABLE_SKILLS, agents: AVAILABLE_AGENTS });
      expect(report.targets.skills.map(target => target.path)).toContain('~/.claude/skills/');
      expect(report.targets.agents.map(target => target.path)).toContain('~/.codex/agents/');
      expect(report.targets.skills.find(target => target.path === `${path}/`)).toMatchObject({
        harness: 'custom',
        exists: true,
        installed: ['docs'],
        updates: [],
        dirty: ['docs']
      });
      expect(calls).toEqual([]);
    });
  });

  describe('User Story: Read results without JSON', () => {
    it('should render change reports as text', () => {
      const text = formatReport({
        ok: true,
        dryRun: true,
        results: [{ kind: 'skills', path: '~/.claude/skills', action: 'would-update', added: ['docs'], removed: ['kernel'], notInstalled: ['nope'], installed: ['docs'] }]
      });

      expect(text).toContain('~/.claude/skills (skills): would-update');
      expect(text).toContain('added: docs');
      expect(text).toContain('removed: kernel');
      expect(text).toContain('not installed, skipped: nope');
      expect(text).toContain('Dry run: nothing was changed.');
    });

    it('should render list reports as text', () => {
      const text = formatReport({
        ok: true,
        available: { skills: ['docs'], agents: [] },
        targets: {
          skills: [{ path: '~/.claude/skills/', harness: 'claude', scope: 'global', exists: true, installed: ['docs'], updates: ['docs'], dirty: [] }],
          agents: [{ path: '.claude/agents/', harness: 'claude', scope: 'local', exists: false, installed: [], updates: [], dirty: [] }]
        }
      });

      expect(text).toContain('Available skills (1): docs');
      expect(text).toContain('Available agents (0): none');
      expect(text).toContain('~/.claude/skills/ (claude | global) - 1 installed, 1 with updates, 0 dirty');
      expect(text).toContain('.claude/agents/ (claude | local) - not installed');
    });
  });
});
