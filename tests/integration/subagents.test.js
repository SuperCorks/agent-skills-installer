/**
 * Integration tests for lib/subagents.js
 * Tests subagent detection from GitHub API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const {
  fetchAvailableSubagents,
  fetchSubagentMetadata,
  getSubagentsRepoUrl,
  SUBAGENTS_REPO_OWNER,
  SUBAGENTS_REPO_NAME
} = await import('../../lib/subagents.js');

describe('Subagents Module', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('User Story: Fetch available subagents from repository', () => {
    it('should fetch subagents list from GitHub API with one request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'developer.agent.md', type: 'file' },
          { name: 'architect.agent.md', type: 'file' },
          { name: 'README.md', type: 'file' },
          { name: '.github', type: 'dir' }
        ]
      });

      const subagents = await fetchAvailableSubagents();

      expect(subagents).toHaveLength(2);
      expect(subagents[0]).toEqual({
        filename: 'developer.agent.md',
        name: 'Developer',
        description: 'Press right arrow to load description'
      });
      expect(subagents[1]).toEqual({
        filename: 'architect.agent.md',
        name: 'Architect',
        description: 'Press right arrow to load description'
      });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should include only .agent.md files', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { name: 'developer.agent.md', type: 'file' },
          { name: 'notes.md', type: 'file' },
          { name: 'agents', type: 'dir' },
          { name: 'tester.agent.md', type: 'file' }
        ]
      });

      const subagents = await fetchAvailableSubagents();

      expect(subagents).toHaveLength(2);
      expect(subagents.map(s => s.filename)).toEqual([
        'developer.agent.md',
        'tester.agent.md'
      ]);
    });
  });

  describe('User Story: Parse subagent metadata lazily', () => {
    it('should parse standard --- frontmatter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: Buffer.from(`---
name: Developer
description: Implements tasks from an approved plan
---

# Developer`).toString('base64')
        })
      });

      const metadata = await fetchSubagentMetadata('developer.agent.md');
      expect(metadata.name).toBe('Developer');
      expect(metadata.description).toBe('Implements tasks from an approved plan');
    });

    it('should parse ```chatagent fenced frontmatter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: Buffer.from(`\`\`\`chatagent
---
name: Architect
description: Creates decision-complete plans
---
\`\`\`

# Architect`).toString('base64')
        })
      });

      const metadata = await fetchSubagentMetadata('architect.agent.md');
      expect(metadata.name).toBe('Architect');
      expect(metadata.description).toBe('Creates decision-complete plans');
    });

    it('should return empty metadata when frontmatter is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: Buffer.from('# No frontmatter here').toString('base64')
        })
      });

      const metadata = await fetchSubagentMetadata('no-frontmatter.agent.md');
      expect(metadata).toEqual({ name: '', description: '' });
    });
  });

  describe('User Story: Handle GitHub API errors', () => {
    it('should throw error when list API returns non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      await expect(fetchAvailableSubagents()).rejects.toThrow('Failed to fetch subagents list');
    });

    it('should throw error when metadata API returns non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(fetchSubagentMetadata('missing.agent.md')).rejects.toThrow('Failed to fetch subagent metadata');
    });

    it('should throw error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchAvailableSubagents()).rejects.toThrow();
    });

    it('should throw meaningful error on rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'rate limit exceeded'
      });

      await expect(fetchAvailableSubagents()).rejects.toThrow('403');
    });
  });

  describe('Repository Configuration', () => {
    it('should return correct repository URL', () => {
      const url = getSubagentsRepoUrl();
      expect(url).toBe(`https://github.com/${SUBAGENTS_REPO_OWNER}/${SUBAGENTS_REPO_NAME}.git`);
    });

    it('should have correct repo owner', () => {
      expect(SUBAGENTS_REPO_OWNER).toBe('supercorks');
    });

    it('should have correct repo name', () => {
      expect(SUBAGENTS_REPO_NAME).toBe('subagents');
    });
  });
});
