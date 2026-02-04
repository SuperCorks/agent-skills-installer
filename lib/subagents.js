/**
 * Fetch and parse available subagents from the GitHub repository
 */

const SUBAGENTS_REPO_OWNER = 'supercorks';
const SUBAGENTS_REPO_NAME = 'subagents';
const GITHUB_API = 'https://api.github.com';

/**
 * Fetch the list of subagent files from the repository
 * Subagents are .agent.md files at the repo root
 * @returns {Promise<Array<{name: string, description: string, filename: string}>>}
 */
export async function fetchAvailableSubagents() {
  const repoUrl = `${GITHUB_API}/repos/${SUBAGENTS_REPO_OWNER}/${SUBAGENTS_REPO_NAME}/contents`;
  
  const response = await fetch(repoUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': '@supercorks/skills-installer'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch subagents list: ${response.status} ${response.statusText}`);
  }

  const contents = await response.json();
  
  // Filter to .agent.md files only
  const agentFiles = contents.filter(
    item => item.type === 'file' && item.name.endsWith('.agent.md')
  );

  // Fetch metadata for each agent file
  const agentChecks = await Promise.all(
    agentFiles.map(async (file) => {
      const metadata = await fetchSubagentMetadata(file.name);
      return {
        filename: file.name,
        name: metadata.name || file.name.replace('.agent.md', ''),
        description: metadata.description || 'No description available'
      };
    })
  );

  return agentChecks;
}

/**
 * Fetch and parse frontmatter from a subagent file
 * @param {string} filename - The agent filename
 * @returns {Promise<{name: string, description: string}>}
 */
async function fetchSubagentMetadata(filename) {
  const fileUrl = `${GITHUB_API}/repos/${SUBAGENTS_REPO_OWNER}/${SUBAGENTS_REPO_NAME}/contents/${filename}`;
  
  try {
    const response = await fetch(fileUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': '@supercorks/skills-installer'
      }
    });

    if (!response.ok) {
      return { name: '', description: '' };
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    
    return parseSubagentFrontmatter(content);
  } catch (error) {
    return { name: '', description: '' };
  }
}

/**
 * Parse the subagent frontmatter to extract name and description
 * Supports both standard YAML frontmatter and chatagent format
 * @param {string} content - The .agent.md file content
 * @returns {{name: string, description: string}}
 */
function parseSubagentFrontmatter(content) {
  // Try to match standard --- frontmatter
  const standardMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  
  // Try to match ```chatagent fenced frontmatter
  const chatAgentMatch = content.match(/```chatagent\s*\n---\s*\n([\s\S]*?)\n---/);
  
  const frontmatterContent = standardMatch?.[1] || chatAgentMatch?.[1];
  
  if (!frontmatterContent) {
    return { name: '', description: '' };
  }

  const nameMatch = frontmatterContent.match(/name:\s*['"]?([^'"\n]+)['"]?/);
  const descMatch = frontmatterContent.match(/description:\s*['"]?([^'"\n]+)['"]?/);

  return {
    name: nameMatch?.[1]?.trim() || '',
    description: descMatch?.[1]?.trim() || ''
  };
}

/**
 * Get the subagents repository clone URL
 * @returns {string}
 */
export function getSubagentsRepoUrl() {
  return `https://github.com/${SUBAGENTS_REPO_OWNER}/${SUBAGENTS_REPO_NAME}.git`;
}

export { SUBAGENTS_REPO_OWNER, SUBAGENTS_REPO_NAME };
