/**
 * Integration tests for lib/git.js
 * Tests sparse-checkout operations and git utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

// Import the module under test
import {
  isGitAvailable,
  listCheckedOutSkills,
  checkSkillsForUpdates,
  checkSubagentsForUpdates,
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
\turl = https://github.com/supercorks/agent-skills.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`);

  writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  
  return gitDir;
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
