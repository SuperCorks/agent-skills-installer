/**
 * Helpers for authenticated GitHub API requests.
 * Uses env tokens first, then falls back to `gh auth token` when available.
 */

import { execFileSync } from 'child_process';

let cachedToken = '';
let tokenResolved = false;

function normalizeToken(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim();
}

function readTokenFromGhCli() {
  try {
    const token = execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    return normalizeToken(token);
  } catch {
    return '';
  }
}

/**
 * Returns a GitHub token if available.
 * Resolution order: GITHUB_TOKEN -> GH_TOKEN -> gh auth token.
 * Value is cached for process lifetime.
 * @returns {string}
 */
export function getGitHubAuthToken() {
  if (tokenResolved) return cachedToken;

  tokenResolved = true;
  cachedToken =
    normalizeToken(process.env.GITHUB_TOKEN) ||
    normalizeToken(process.env.GH_TOKEN) ||
    readTokenFromGhCli() ||
    '';

  return cachedToken;
}

/**
 * Build GitHub API headers with optional auth.
 * @param {string} [userAgent='@supercorks/skills-installer']
 * @returns {Record<string, string>}
 */
export function getGitHubHeaders(userAgent = '@supercorks/skills-installer') {
  const headers = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': userAgent
  };

  const token = getGitHubAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Test-only cache reset helper.
 */
export function __resetGitHubAuthCacheForTests() {
  cachedToken = '';
  tokenResolved = false;
}
