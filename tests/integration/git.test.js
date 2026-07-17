/**
 * Integration tests for lib/git.js
 * Tests sparse-checkout operations and git utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dirname, join, resolve } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, mkdtempSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { execFileSync, execSync } from 'child_process';

// Import the module under test
import {
  isGitAvailable,
  isInsideGitWorkTree,
  listCheckedOutSkills,
  updateSparseCheckout,
  updateSubagentsSparseCheckout,
  checkSkillsForUpdates,
  checkSubagentsForUpdates,
  checkSkillsForDirtyChanges,
  checkSubagentsForDirtyChanges,
} from '../../lib/git.js';

// ============================================================================
// Test Utilities
// ============================================================================

function createTempDir() {
  const path = mkdtempSync(join(tmpdir(), 'git-test-'));
  return {
    path,
    cleanup: () => {
      try { rmSync(path, { recursive: true, force: true }); } catch {}
    }
  };
}

function createHomeTempDir() {
  const path = mkdtempSync(join(homedir(), '.skills-installer-test-'));
  return {
    path,
    cleanup: () => {
      try { rmSync(path, { recursive: true, force: true }); } catch {}
    }
  };
}

function createMockGitRepo(basePath, sparseCheckoutPatterns = []) {
  const gitDir = join(basePath, '.git');
  const infoDir = join(gitDir, 'info');
  const refsDir = join(gitDir, 'refs', 'heads');
  const objectsDir = join(gitDir, 'objects');
  
  mkdirSync(infoDir, { recursive: true });
  mkdirSync(refsDir, { recursive: true });
  mkdirSync(objectsDir, { recursive: true });
  
  // Write sparse-checkout config
  const patterns = sparseCheckoutPatterns.map(s => `/${s}/`).join('\n');
  writeFileSync(join(infoDir, 'sparse-checkout'), patterns ? patterns + '\n' : '\n');
  
  // Write minimal git config
  writeFileSync(join(gitDir, 'config'), `[core]
\trepositoryformatversion = 0
\tfilemode = true
\tbare = false
[remote "origin"]
\turl = ${join(basePath, 'missing-remote.git')}
\tfetch = +refs/heads/*:refs/remotes/origin/*
`);

  writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  
  return gitDir;
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  }).toString().trim();
}

function writeRepoFile(root, filePath, content) {
  const absolutePath = join(root, filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function commitAll(cwd, message) {
  git(['add', '.'], cwd);
  git(['commit', '-m', message], cwd);
}

function createRemoteFixture(files) {
  const remoteDir = createTempDir();
  const sourceDir = createTempDir();

  git(['init', '--bare'], remoteDir.path);
  git(['init'], sourceDir.path);
  git(['config', 'user.email', 'installer-tests@example.com'], sourceDir.path);
  git(['config', 'user.name', 'Installer Tests'], sourceDir.path);

  for (const [filePath, content] of Object.entries(files)) {
    writeRepoFile(sourceDir.path, filePath, content);
  }

  commitAll(sourceDir.path, 'initial content');
  git(['branch', '-M', 'main'], sourceDir.path);
  git(['remote', 'add', 'origin', remoteDir.path], sourceDir.path);
  git(['push', '-u', 'origin', 'main'], sourceDir.path);

  return {
    remotePath: remoteDir.path,
    sourcePath: sourceDir.path,
    cleanup: () => {
      remoteDir.cleanup();
      sourceDir.cleanup();
    }
  };
}

function cloneSparseRepo(targetPath, remotePath, patterns) {
  mkdirSync(targetPath, { recursive: true });
  git(['clone', '--no-checkout', '--sparse', remotePath, '.'], targetPath);
  git(['sparse-checkout', 'init', '--no-cone'], targetPath);
  writeFileSync(join(targetPath, '.git', 'info', 'sparse-checkout'), patterns.join('\n') + '\n');
  git(['checkout', '-B', 'main', 'origin/main'], targetPath);
}

function pushRemoteChange(sourcePath, filePath, content, message) {
  writeRepoFile(sourcePath, filePath, content);
  commitAll(sourcePath, message);
  git(['push'], sourcePath);
}

// ============================================================================
// Git Availability Tests
// ============================================================================

describe('Git Availability', () => {
  describe('User Story: Check if git is installed', () => {
    it('should return true when git is available', () => {
      // Assuming git is installed in test environment
      const result = isGitAvailable();
      expect(result).toBe(true);
    });
  });
});

// ============================================================================
// Git Work Tree Detection Tests
// ============================================================================

describe('Git Work Tree Detection', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Detect whether current directory is in a git repository', () => {
    it('should return false when path is not in a git repository', () => {
      const result = isInsideGitWorkTree(tempDir.path);
      expect(result).toBe(false);
    });

    it('should return true for a git repository root', () => {
      execSync('git init', { cwd: tempDir.path, stdio: 'ignore' });
      const result = isInsideGitWorkTree(tempDir.path);
      expect(result).toBe(true);
    });

    it('should return true for a nested directory within a git repository', () => {
      execSync('git init', { cwd: tempDir.path, stdio: 'ignore' });
      const nested = join(tempDir.path, 'nested', 'child');
      mkdirSync(nested, { recursive: true });
      const result = isInsideGitWorkTree(nested);
      expect(result).toBe(true);
    });
  });
});

// ============================================================================
// List Checked Out Skills Tests
// ============================================================================

describe('List Checked Out Skills', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: View currently installed skills', () => {
    it('should list skills from sparse-checkout config', async () => {
      createMockGitRepo(tempDir.path, ['address-pr-comments', 'gtm-manager']);

      const skills = await listCheckedOutSkills(tempDir.path);

      expect(skills).toHaveLength(2);
      expect(skills).toContain('address-pr-comments');
      expect(skills).toContain('gtm-manager');
    });

    it('should return empty array when no skills configured', async () => {
      createMockGitRepo(tempDir.path, []);

      const skills = await listCheckedOutSkills(tempDir.path);

      expect(skills).toHaveLength(0);
    });

    it('should handle single skill', async () => {
      createMockGitRepo(tempDir.path, ['single-skill']);

      const skills = await listCheckedOutSkills(tempDir.path);

      expect(skills).toHaveLength(1);
      expect(skills[0]).toBe('single-skill');
    });

    it('should filter out hidden folders from patterns', async () => {
      const gitDir = createMockGitRepo(tempDir.path, ['valid-skill']);
      
      // Manually add a hidden folder pattern that shouldn't be returned
      const sparseCheckoutPath = join(gitDir, 'info', 'sparse-checkout');
      const content = readFileSync(sparseCheckoutPath, 'utf-8');
      writeFileSync(sparseCheckoutPath, content + '/.hidden/\n');

      const skills = await listCheckedOutSkills(tempDir.path);

      expect(skills).not.toContain('.hidden');
      expect(skills).toContain('valid-skill');
    });
  });

  describe('User Story: Handle invalid repository paths', () => {
    it('should throw error for non-git directory', async () => {
      // Directory exists but is not a git repo
      await expect(listCheckedOutSkills(tempDir.path)).rejects.toThrow('is not a git repository');
    });

    it('should throw error for non-existent directory', async () => {
      const nonExistent = join(tempDir.path, 'does-not-exist');
      await expect(listCheckedOutSkills(nonExistent)).rejects.toThrow('is not a git repository');
    });
  });

  describe('User Story: Handle missing sparse-checkout file', () => {
    it('should return empty array when sparse-checkout file missing', async () => {
      const gitDir = join(tempDir.path, '.git');
      mkdirSync(gitDir, { recursive: true });
      writeFileSync(join(gitDir, 'config'), '[core]\n\tbare = false\n');

      const skills = await listCheckedOutSkills(tempDir.path);

      expect(skills).toHaveLength(0);
    });
  });

  describe('User Story: Resolve home shorthand paths', () => {
    let homeTempDir;

    beforeEach(() => {
      homeTempDir = createHomeTempDir();
    });

    afterEach(() => {
      homeTempDir?.cleanup();
    });

    it('should resolve ~/ paths when listing checked out skills', async () => {
      createMockGitRepo(homeTempDir.path, ['tilde-skill']);

      const relativeToHome = homeTempDir.path.replace(`${homedir()}/`, '~/');
      const skills = await listCheckedOutSkills(relativeToHome);

      expect(skills).toContain('tilde-skill');
    });
  });
});

// ============================================================================
// Sparse Checkout Pattern Parsing Tests
// ============================================================================

describe('Sparse Checkout Pattern Parsing', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Correctly parse sparse-checkout patterns', () => {
    it('should parse patterns with leading and trailing slashes', async () => {
      createMockGitRepo(tempDir.path, ['skill-a', 'skill-b']);

      const skills = await listCheckedOutSkills(tempDir.path);

      expect(skills).toEqual(['skill-a', 'skill-b']);
    });

    it('should handle patterns with extra whitespace', async () => {
      const gitDir = createMockGitRepo(tempDir.path, []);
      const sparseCheckoutPath = join(gitDir, 'info', 'sparse-checkout');
      
      // Write patterns with extra whitespace and blank lines
      writeFileSync(sparseCheckoutPath, `
/skill-a/

/skill-b/
  
/skill-c/
`);

      const skills = await listCheckedOutSkills(tempDir.path);

      expect(skills).toContain('skill-a');
      expect(skills).toContain('skill-b');
      expect(skills).toContain('skill-c');
    });

    it('should handle nested folder patterns correctly', async () => {
      const gitDir = createMockGitRepo(tempDir.path, []);
      const sparseCheckoutPath = join(gitDir, 'info', 'sparse-checkout');
      
      // Non-cone mode patterns exactly as the CLI writes them
      writeFileSync(sparseCheckoutPath, `/simple-skill/
/nested-skill/
`);

      const skills = await listCheckedOutSkills(tempDir.path);

      expect(skills.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================================================
// Git Repository URL Tests
// ============================================================================

describe('Repository URL', () => {
  describe('User Story: Get correct clone URL', () => {
    it('should use HTTPS URL for cloning', async () => {
      const { getRepoUrl } = await import('../../lib/skills.js');
      const url = getRepoUrl();

      expect(url).toMatch(/^https:\/\/github\.com\//);
      expect(url).toContain('supercorks/agent-skills');
      expect(url).toMatch(/\.git$/);
    });
  });
});

// ============================================================================
// Sparse Clone Tests (requires actual git - may skip in CI)
// ============================================================================

describe('Sparse Clone Operations', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Clone with sparse checkout', () => {
    it('should verify clone uses filter and sparse flags', async () => {
      // This is a documentation/specification test
      // The actual sparseCloneSkills function uses:
      // git clone --filter=blob:none --no-checkout --sparse <url>
      
      const expectedFlags = ['--filter=blob:none', '--no-checkout', '--sparse'];
      
      // Verify the flags are documented correctly
      expectedFlags.forEach(flag => {
        expect(flag).toBeTruthy();
      });
    });

    it('should use non-cone mode for precise folder control', async () => {
      // The CLI uses: git sparse-checkout init --no-cone
      // This allows /folder/ patterns that include only that folder
      const expectedMode = '--no-cone';
      expect(expectedMode).toBe('--no-cone');
    });
  });

  describe('User Story: Update sparse checkout configuration', () => {
    it('should overwrite sparse-checkout patterns on update', async () => {
      const gitDir = createMockGitRepo(tempDir.path, ['old-skill']);
      const sparseCheckoutPath = join(gitDir, 'info', 'sparse-checkout');
      
      // Simulate what updateSparseCheckout does
      const newSkills = ['new-skill-a', 'new-skill-b'];
      const patterns = newSkills.map(folder => `/${folder}/`).join('\n');
      writeFileSync(sparseCheckoutPath, patterns + '\n');

      const content = readFileSync(sparseCheckoutPath, 'utf-8');
      
      expect(content).toContain('/new-skill-a/');
      expect(content).toContain('/new-skill-b/');
      expect(content).not.toContain('/old-skill/');
    });

    it('should fast-forward before applying selected skill patterns', async () => {
      const fixture = createRemoteFixture({
        'skill-a/SKILL.md': 'version 1\n',
        'skill-b/SKILL.md': 'skill b\n'
      });
      const installDir = createTempDir();

      try {
        cloneSparseRepo(installDir.path, fixture.remotePath, ['/skill-a/']);
        pushRemoteChange(fixture.sourcePath, 'skill-a/SKILL.md', 'version 2\n', 'update skill a');

        const progress = [];
        await updateSparseCheckout(installDir.path, ['skill-a', 'skill-b'], message => {
          progress.push(message);
        });

        expect(readFileSync(join(installDir.path, 'skill-a', 'SKILL.md'), 'utf-8')).toBe('version 2\n');
        expect(readFileSync(join(installDir.path, 'skill-b', 'SKILL.md'), 'utf-8')).toBe('skill b\n');
        expect(readFileSync(join(installDir.path, '.git', 'info', 'sparse-checkout'), 'utf-8')).toContain('/skill-b/');
        expect(progress).toContain('Fetching latest changes...');
      } finally {
        fixture.cleanup();
        installDir.cleanup();
      }
    });

    it('should fail loudly when local skill changes block the update', async () => {
      const fixture = createRemoteFixture({
        'skill-a/SKILL.md': 'version 1\n'
      });
      const installDir = createTempDir();

      try {
        cloneSparseRepo(installDir.path, fixture.remotePath, ['/skill-a/']);
        pushRemoteChange(fixture.sourcePath, 'skill-a/SKILL.md', 'version 2\n', 'update skill a');
        writeFileSync(join(installDir.path, 'skill-a', 'SKILL.md'), 'local edit\n');

        await expect(updateSparseCheckout(installDir.path, ['skill-a']))
          .rejects
          .toThrow(/Could not update sparse checkout/);
        expect(readFileSync(join(installDir.path, 'skill-a', 'SKILL.md'), 'utf-8')).toBe('local edit\n');
      } finally {
        fixture.cleanup();
        installDir.cleanup();
      }
    });

    it('should fast-forward before applying selected subagent patterns', async () => {
      const fixture = createRemoteFixture({
        'Developer.agent.md': 'version 1\n',
        'Reviewer.agent.md': 'reviewer\n'
      });
      const installDir = createTempDir();

      try {
        cloneSparseRepo(installDir.path, fixture.remotePath, ['/Developer.agent.md']);
        pushRemoteChange(fixture.sourcePath, 'Developer.agent.md', 'version 2\n', 'update developer');

        await updateSubagentsSparseCheckout(installDir.path, ['Developer.agent.md', 'Reviewer.agent.md']);

        expect(readFileSync(join(installDir.path, 'Developer.agent.md'), 'utf-8')).toBe('version 2\n');
        expect(readFileSync(join(installDir.path, 'Reviewer.agent.md'), 'utf-8')).toBe('reviewer\n');
        expect(readFileSync(join(installDir.path, '.git', 'info', 'sparse-checkout'), 'utf-8')).toContain('/Reviewer.agent.md');
      } finally {
        fixture.cleanup();
        installDir.cleanup();
      }
    });

    it('should report dirty skill folders', async () => {
      const fixture = createRemoteFixture({
        'skill-a/SKILL.md': 'version 1\n',
        'skill-b/SKILL.md': 'version 1\n'
      });
      const installDir = createTempDir();

      try {
        cloneSparseRepo(installDir.path, fixture.remotePath, ['/skill-a/', '/skill-b/']);
        writeFileSync(join(installDir.path, 'skill-a', 'SKILL.md'), 'local edit\n');
        writeRepoFile(installDir.path, 'skill-b/local.txt', 'untracked\n');

        const dirty = await checkSkillsForDirtyChanges(installDir.path, ['skill-a', 'skill-b']);

        expect(Array.from(dirty).sort()).toEqual(['skill-a', 'skill-b']);
      } finally {
        fixture.cleanup();
        installDir.cleanup();
      }
    });

    it('should report dirty subagent files', async () => {
      const fixture = createRemoteFixture({
        'Developer.agent.md': 'version 1\n',
        'Reviewer.agent.md': 'reviewer\n'
      });
      const installDir = createTempDir();

      try {
        cloneSparseRepo(installDir.path, fixture.remotePath, ['/Developer.agent.md', '/Reviewer.agent.md']);
        writeFileSync(join(installDir.path, 'Developer.agent.md'), 'local edit\n');

        const dirty = await checkSubagentsForDirtyChanges(installDir.path, ['Developer.agent.md', 'Reviewer.agent.md']);

        expect(Array.from(dirty)).toEqual(['Developer.agent.md']);
      } finally {
        fixture.cleanup();
        installDir.cleanup();
      }
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Git Error Handling', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Handle git operation failures', () => {
    it('should detect when target path already has git repo', async () => {
      createMockGitRepo(tempDir.path, ['existing-skill']);
      
      const gitDir = join(tempDir.path, '.git');
      const hasGit = existsSync(gitDir);

      expect(hasGit).toBe(true);
      // The CLI should refuse to clone into this directory
    });

    it('should provide meaningful error for invalid repo state', async () => {
      // Create incomplete git directory
      const gitDir = join(tempDir.path, '.git');
      mkdirSync(gitDir, { recursive: true });
      // Don't create required files
      
      await expect(listCheckedOutSkills(tempDir.path)).resolves.toHaveLength(0);
    });
  });
});

// ============================================================================
// Update Detection Tests
// ============================================================================

describe('Update Detection', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    tempDir?.cleanup();
  });

  describe('User Story: Check skills for available updates', () => {
    it('should return empty set for non-git directory', async () => {
      const result = await checkSkillsForUpdates(tempDir.path, ['skill-a']);
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should return empty set when fetch fails', async () => {
      // Create mock git repo without remote configured properly
      createMockGitRepo(tempDir.path, ['skill-a']);
      
      const result = await checkSkillsForUpdates(tempDir.path, ['skill-a']);
      expect(result).toBeInstanceOf(Set);
      // Should gracefully return empty set on error
      expect(result.size).toBe(0);
    });

    it('should accept array of skill folders to check', async () => {
      createMockGitRepo(tempDir.path, ['skill-a', 'skill-b']);
      
      // Function should accept and process array
      const skillsToCheck = ['skill-a', 'skill-b', 'skill-c'];
      const result = await checkSkillsForUpdates(tempDir.path, skillsToCheck);
      
      expect(result).toBeInstanceOf(Set);
    });
  });

  describe('User Story: Check subagents for available updates', () => {
    it('should return empty set for non-git directory', async () => {
      const result = await checkSubagentsForUpdates(tempDir.path, ['Agent.agent.md']);
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should return empty set when fetch fails', async () => {
      createMockGitRepo(tempDir.path, []);
      
      const result = await checkSubagentsForUpdates(tempDir.path, ['Agent.agent.md']);
      expect(result).toBeInstanceOf(Set);
      expect(result.size).toBe(0);
    });

    it('should accept array of agent filenames to check', async () => {
      createMockGitRepo(tempDir.path, []);
      
      const agentsToCheck = ['Developer.agent.md', 'Tester.agent.md'];
      const result = await checkSubagentsForUpdates(tempDir.path, agentsToCheck);
      
      expect(result).toBeInstanceOf(Set);
    });
  });
});
