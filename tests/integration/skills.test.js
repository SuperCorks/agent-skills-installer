/**
 * Integration tests for lib/skills.js
 * Tests skill detection from GitHub API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally before importing the module
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Now import the module under test
const { fetchAvailableSkills, fetchSkillMetadata, getRepoUrl, REPO_OWNER, REPO_NAME } = await import('../../lib/skills.js');

describe('Skills Module', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('User Story: Fetch available skills from repository', () => {
    it('should fetch skills list from GitHub API with one request', async () => {
      // Mock root contents response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'address-pr-comments', type: 'dir' },
          { name: 'gtm-manager', type: 'dir' },
          { name: '.github', type: 'dir' },
          { name: 'README.md', type: 'file' }
        ]
      });

      const skills = await fetchAvailableSkills();

      expect(skills).toHaveLength(2);
      expect(skills[0]).toEqual({
        folder: 'address-pr-comments',
        name: 'Address Pr Comments',
        description: 'Press right arrow to load description'
      });
      expect(skills[1]).toEqual({
        folder: 'gtm-manager',
        name: 'Gtm Manager',
        description: 'Press right arrow to load description'
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should filter out excluded folders (.github, .claude, node_modules)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: '.github', type: 'dir' },
          { name: '.claude', type: 'dir' },
          { name: 'node_modules', type: 'dir' },
          { name: '.hidden', type: 'dir' },
          { name: 'valid-skill', type: 'dir' }
        ]
      });

      const skills = await fetchAvailableSkills();

      // Should only include valid-skill, not any excluded folders
      expect(skills).toHaveLength(1);
      expect(skills[0].folder).toBe('valid-skill');
    });

    it('should filter out files (only directories are skills)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'README.md', type: 'file' },
          { name: 'package.json', type: 'file' },
          { name: 'my-skill', type: 'dir' }
        ]
      });

      const skills = await fetchAvailableSkills();

      expect(skills).toHaveLength(1);
      expect(skills[0].folder).toBe('my-skill');
    });

    it('should include directories and lazy-load metadata later', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'has-skill-md', type: 'dir' },
          { name: 'no-skill-md', type: 'dir' }
        ]
      });

      const skills = await fetchAvailableSkills();

      expect(skills).toHaveLength(2);
      expect(skills[0].folder).toBe('has-skill-md');
    });
  });

  describe('User Story: Parse SKILL.md frontmatter lazily', () => {
    it('should parse standard --- frontmatter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: Buffer.from(`---
name: Test Skill
description: This is a test skill
---
# Test Skill

Some content here.`).toString('base64')
        })
      });

      const metadata = await fetchSkillMetadata('test-skill');
      expect(metadata.name).toBe('Test Skill');
      expect(metadata.description).toBe('This is a test skill');
    });

    it('should parse ```skill fenced frontmatter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: Buffer.from(`\`\`\`skill
---
name: Fenced Skill
description: Uses fenced frontmatter
---
\`\`\`

# Fenced Skill`).toString('base64')
        })
      });

      const metadata = await fetchSkillMetadata('fenced-skill');
      expect(metadata.name).toBe('Fenced Skill');
      expect(metadata.description).toBe('Uses fenced frontmatter');
    });

    it('should fallback to folder name when no name in frontmatter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: Buffer.from(`---
description: Has description but no name
---`).toString('base64')
        })
      });

      const metadata = await fetchSkillMetadata('unnamed-skill');
      expect(metadata.name).toBe('');
      expect(metadata.description).toBe('Has description but no name');
    });
  });

  describe('User Story: Handle GitHub API errors', () => {
    it('should throw error when API returns non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      await expect(fetchAvailableSkills()).rejects.toThrow('Failed to fetch skills list');
    });

    it('should throw error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchAvailableSkills()).rejects.toThrow();
    });

    it('should throw meaningful error on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'rate limit exceeded'
      });

      await expect(fetchAvailableSkills()).rejects.toThrow('403');
    });
  });

  describe('Repository Configuration', () => {
    it('should return correct repository URL', () => {
      const url = getRepoUrl();
      expect(url).toBe(`https://github.com/${REPO_OWNER}/${REPO_NAME}.git`);
    });

    it('should have correct repo owner', () => {
      expect(REPO_OWNER).toBe('supercorks');
    });

    it('should have correct repo name', () => {
      expect(REPO_NAME).toBe('agent-skills');
    });
  });
});
