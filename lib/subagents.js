/**
 * Fetch and parse available subagents from the GitHub repository
 */

import { getGitHubHeaders } from './github-auth.js';

const SUBAGENTS_REPO_OWNER = 'supercorks';
const SUBAGENTS_REPO_NAME = 'subagents';
const GITHUB_API = 'https://api.github.com';

function humanizeAgentName(filename) {
  const base = filename.replace('.agent.md', '');
  return base
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function extractSubagentSections(content) {
  const standardMatch = content.match(/^(---\s*\n[\s\S]*?\n---)(?:\s*\n)?/);
  if (standardMatch) {
    return {
      frontmatter: standardMatch[1].replace(/^---\s*\n|\n---$/g, ''),
      body: content.slice(standardMatch[0].length).trim(),
    };
  }

  const chatAgentMatch = content.match(/^```chatagent\s*\n---\s*\n([\s\S]*?)\n---\s*\n```(?:\s*\n)?/);
  if (chatAgentMatch) {
    return {
      frontmatter: chatAgentMatch[1],
      body: content.slice(chatAgentMatch[0].length).trim(),
    };
  }

  return {
    frontmatter: '',
    body: content.trim(),
  };
}

/**
 * Fetch the list of subagent files from the repository
 * Subagents are .agent.md files at the repo root
 * @returns {Promise<Array<{name: string, description: string, filename: string}>>}
 */
export async function fetchAvailableSubagents() {
  const repoUrl = `${GITHUB_API}/repos/${SUBAGENTS_REPO_OWNER}/${SUBAGENTS_REPO_NAME}/contents`;
  
  const response = await fetch(repoUrl, {
    headers: getGitHubHeaders()
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch subagents list: ${response.status} ${response.statusText}`);
  }

  const contents = await response.json();
  
  // Filter to .agent.md files only
  const agentFiles = contents.filter(
    item => item.type === 'file' && item.name.endsWith('.agent.md')
  );

  // Keep listing lightweight: metadata is loaded lazily on expand in the UI
  return agentFiles.map(file => ({
    filename: file.name,
    name: humanizeAgentName(file.name),
    description: 'Press right arrow to load description'
  }));
}

/**
 * Fetch and parse frontmatter from a subagent file
 * @param {string} filename - The agent filename
 * @returns {Promise<{name: string, description: string}>}
 */
export async function fetchSubagentMetadata(filename) {
  try {
    const content = await fetchSubagentContent(filename);
    return parseSubagentFrontmatter(content);
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch the raw source for a subagent file
 * @param {string} filename - The agent filename
 * @returns {Promise<string>}
 */
export async function fetchSubagentContent(filename) {
  const fileUrl = `${GITHUB_API}/repos/${SUBAGENTS_REPO_OWNER}/${SUBAGENTS_REPO_NAME}/contents/${filename}`;
  
  try {
    const response = await fetch(fileUrl, {
      headers: getGitHubHeaders()
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch subagent metadata: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return Buffer.from(data.content, 'base64').toString('utf-8');
  } catch (error) {
    throw error;
  }
}

/**
 * Read a flat top-level scalar key from frontmatter.
 * The key must start the line so that `model` never matches `codex_model`.
 * Values may be unquoted or wrapped in single/double quotes.
 * @param {string} frontmatterContent
 * @param {string} key
 * @returns {string}
 */
function readFrontmatterValue(frontmatterContent, key) {
  const match = frontmatterContent.match(new RegExp(`^[ \\t]*${key}:[ \\t]*(.*)$`, 'm'));
  if (!match) {
    return '';
  }

  const rawValue = match[1].trim();
  const quoted = rawValue.match(/^(['"])([\s\S]*)\1$/);

  return (quoted ? quoted[2] : rawValue).trim();
}

/**
 * Parse the subagent frontmatter to extract metadata
 * Supports both standard YAML frontmatter and chatagent format
 * @param {string} content - The .agent.md file content
 * @returns {{name: string, description: string, model: string, effort: string, codexModel: string, codexEffort: string}}
 */
function parseSubagentFrontmatter(content) {
  const { frontmatter: frontmatterContent } = extractSubagentSections(content);

  if (!frontmatterContent) {
    return { name: '', description: '', model: '', effort: '', codexModel: '', codexEffort: '' };
  }

  const nameMatch = frontmatterContent.match(/name:\s*['"]?([^'"\n]+)['"]?/);
  const descMatch = frontmatterContent.match(/description:\s*['"]?([^'"\n]+)['"]?/);

  return {
    name: nameMatch?.[1]?.trim() || '',
    description: descMatch?.[1]?.trim() || '',
    model: readFrontmatterValue(frontmatterContent, 'model'),
    effort: readFrontmatterValue(frontmatterContent, 'effort'),
    codexModel: readFrontmatterValue(frontmatterContent, 'codex_model'),
    codexEffort: readFrontmatterValue(frontmatterContent, 'codex_effort')
  };
}

/**
 * Parse a subagent file into metadata and body content.
 * @param {string} content - The .agent.md file content
 * @param {string} filename - The source filename for fallback naming
 * @returns {{name: string, description: string, model: string, effort: string, codexModel: string, codexEffort: string, body: string, filename: string}}
 */
export function parseSubagentDefinition(content, filename = '') {
  const metadata = parseSubagentFrontmatter(content);
  const { body } = extractSubagentSections(content);

  return {
    filename,
    name: metadata.name || humanizeAgentName(filename),
    description: metadata.description || '',
    model: metadata.model || '',
    effort: metadata.effort || '',
    codexModel: metadata.codexModel || '',
    codexEffort: metadata.codexEffort || '',
    body,
  };
}

/**
 * Get the subagents repository clone URL
 * @returns {string}
 */
export function getSubagentsRepoUrl() {
  return `https://github.com/${SUBAGENTS_REPO_OWNER}/${SUBAGENTS_REPO_NAME}.git`;
}

export { SUBAGENTS_REPO_OWNER, SUBAGENTS_REPO_NAME, humanizeAgentName };
