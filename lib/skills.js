/**
 * Fetch and parse available skills from the GitHub repository
 */

const REPO_OWNER = 'supercorks';
const REPO_NAME = 'agent-skills';
const GITHUB_API = 'https://api.github.com';

// Folders to exclude from skill detection (not actual skills)
const EXCLUDED_FOLDERS = ['.github', '.claude', 'node_modules'];

function humanizeSkillName(folder) {
  return folder
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Fetch the list of skill directories from the repository
 * Skills are at the repo root level, each folder with a SKILL.md is a skill
 * @returns {Promise<Array<{name: string, description: string, folder: string}>>}
 */
export async function fetchAvailableSkills() {
  const repoUrl = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents`;
  
  const response = await fetch(repoUrl, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': '@supercorks/skills-installer'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch skills list: ${response.status} ${response.statusText}`);
  }

  const contents = await response.json();
  
  // Filter to directories that aren't excluded
  const potentialSkillDirs = contents.filter(
    item => item.type === 'dir' && !EXCLUDED_FOLDERS.includes(item.name) && !item.name.startsWith('.')
  );

  // Keep listing lightweight: metadata is loaded lazily on expand in the UI
  return potentialSkillDirs.map(dir => ({
    folder: dir.name,
    name: humanizeSkillName(dir.name),
    description: 'Press right arrow to load description'
  }));
}

/**
 * Fetch and parse SKILL.md frontmatter for a specific skill
 * @param {string} skillFolder - The skill folder name
 * @returns {Promise<{name: string, description: string}>}
 */
export async function fetchSkillMetadata(skillFolder) {
  const skillMdUrl = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${skillFolder}/SKILL.md`;
  
  try {
    const response = await fetch(skillMdUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': '@supercorks/skills-installer'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch skill metadata: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    
    return parseSkillFrontmatter(content);
  } catch (error) {
    throw error;
  }
}

/**
 * Parse the SKILL.md frontmatter to extract name and description
 * Supports both ```skill code fence and standard --- frontmatter
 * @param {string} content - The SKILL.md file content
 * @returns {{name: string, description: string}}
 */
function parseSkillFrontmatter(content) {
  // Try to match ```skill fenced frontmatter first
  const skillFenceMatch = content.match(/```skill\s*\n---\s*\n([\s\S]*?)\n---\s*\n/);
  
  // Fall back to standard --- frontmatter
  const standardMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  
  const frontmatterContent = skillFenceMatch?.[1] || standardMatch?.[1];
  
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
 * Get the repository clone URL
 * @returns {string}
 */
export function getRepoUrl() {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
}

export { REPO_OWNER, REPO_NAME };
