/**
 * Supported install targets for skills and agents.
 */

export const SKILL_INSTALL_TARGETS = [
  { path: '~/.agents/skills/', harness: 'copilot/codex', scope: 'global' },
  { path: '~/.claude/skills/', harness: 'claude', scope: 'global' },
  { path: '.agents/skills/', harness: 'copilot/codex', scope: 'local' },
  { path: '.claude/skills/', harness: 'claude', scope: 'local' }
];

export const LEGACY_SKILL_INSTALL_TARGETS = [
  {
    path: '.github/skills/',
    harness: 'copilot',
    scope: 'legacy local'
  },
  {
    path: '~/.copilot/skills/',
    harness: 'copilot',
    scope: 'legacy global'
  },
  {
    path: '~/.codex/skills/',
    harness: 'codex',
    scope: 'legacy global'
  }
];

export const AGENT_INSTALL_TARGETS = [
  { path: '~/.agents/agents/', harness: 'copilot', scope: 'global', installMode: 'sparse-git' },
  { path: '~/.claude/agents/', harness: 'claude', scope: 'global', installMode: 'sparse-git' },
  { path: '~/.codex/agents/', harness: 'codex', scope: 'global', installMode: 'codex-toml' },
  { path: '.agents/agents/', harness: 'copilot', scope: 'local', installMode: 'sparse-git' },
  { path: '.claude/agents/', harness: 'claude', scope: 'local', installMode: 'sparse-git' },
  { path: '.codex/agents/', harness: 'codex', scope: 'local', installMode: 'codex-toml' }
];

export const LEGACY_AGENT_INSTALL_TARGETS = [
  {
    path: '.github/agents/',
    harness: 'copilot',
    scope: 'legacy local'
  },
  {
    path: '~/.copilot/agents/',
    harness: 'copilot',
    scope: 'legacy global'
  }
];

export function allSkillDetectionTargets() {
  return [...SKILL_INSTALL_TARGETS, ...LEGACY_SKILL_INSTALL_TARGETS];
}

export function allAgentDetectionTargets() {
  return [...AGENT_INSTALL_TARGETS, ...LEGACY_AGENT_INSTALL_TARGETS];
}

export function orderTargetsGlobalFirst(targets) {
  return [...targets].sort((left, right) => {
    const leftGlobal = left.scope.includes('global') ? 0 : 1;
    const rightGlobal = right.scope.includes('global') ? 0 : 1;

    if (leftGlobal !== rightGlobal) {
      return leftGlobal - rightGlobal;
    }

    return targets.indexOf(left) - targets.indexOf(right);
  });
}

export function getAgentInstallMode(path) {
  const exactTarget = getTargetByPath(AGENT_INSTALL_TARGETS, path);
  if (exactTarget?.installMode) {
    return exactTarget.installMode;
  }

  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+$/, '');
  if (normalizedPath.endsWith('/.codex/agents') || normalizedPath === '.codex/agents' || normalizedPath === '~/.codex/agents') {
    return 'codex-toml';
  }

  return 'sparse-git';
}

export function getTargetByPath(targets, path) {
  return targets.find(target => target.path === path);
}

export function formatTargetLabel(target, count, noun, { installed = false } = {}) {
  const plural = count === 1 ? noun : `${noun}s`;
  const countText = installed ? `${count} ${plural} installed` : `${count} ${plural}`;
  const detail = target
    ? `${target.harness} | ${target.scope} | ${countText}`
    : countText;

  return `${target?.path || ''} (${detail})`;
}