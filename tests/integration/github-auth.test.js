/**
 * Integration tests for lib/github-auth.js
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn()
}));

vi.mock('child_process', () => ({
  execFileSync: mockExecFileSync
}));

const {
  getGitHubHeaders,
  getGitHubAuthToken,
  __resetGitHubAuthCacheForTests
} = await import('../../lib/github-auth.js');

describe('GitHub Auth Helpers', () => {
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const originalGhToken = process.env.GH_TOKEN;

  beforeEach(() => {
    mockExecFileSync.mockReset();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    __resetGitHubAuthCacheForTests();
  });

  afterEach(() => {
    if (originalGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }

    if (originalGhToken === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = originalGhToken;
    }

    __resetGitHubAuthCacheForTests();
  });

  it('should use GITHUB_TOKEN when present', () => {
    process.env.GITHUB_TOKEN = 'github-token-value';

    const headers = getGitHubHeaders();

    expect(headers.Authorization).toBe('Bearer github-token-value');
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('should use GH_TOKEN when GITHUB_TOKEN is not set', () => {
    process.env.GH_TOKEN = 'gh-token-value';

    const headers = getGitHubHeaders();

    expect(headers.Authorization).toBe('Bearer gh-token-value');
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('should fall back to gh auth token when env tokens are missing', () => {
    mockExecFileSync.mockReturnValueOnce('token-from-gh\n');

    const headers = getGitHubHeaders();

    expect(mockExecFileSync).toHaveBeenCalledWith('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    expect(headers.Authorization).toBe('Bearer token-from-gh');
  });

  it('should return headers without Authorization when no token is available', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('gh not available');
    });

    const headers = getGitHubHeaders();

    expect(headers.Authorization).toBeUndefined();
    expect(headers.Accept).toBe('application/vnd.github.v3+json');
  });

  it('should cache token lookup and avoid repeated gh calls', () => {
    mockExecFileSync.mockReturnValueOnce('cached-token');

    const firstToken = getGitHubAuthToken();
    const secondToken = getGitHubAuthToken();

    expect(firstToken).toBe('cached-token');
    expect(secondToken).toBe('cached-token');
    expect(mockExecFileSync).toHaveBeenCalledTimes(1);
  });
});
