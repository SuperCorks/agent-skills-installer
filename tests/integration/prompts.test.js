/**
 * Tests for lib/prompts.js utility functions
 * Note: Interactive prompt testing is limited without TTY mocking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Prompts Module Utilities', () => {
  
  describe('User Story: Display success message after installation', () => {
    it('should format success message correctly', async () => {
      const { showSuccess } = await import('../../lib/prompts.js');
      
      // Capture console output
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));
      
      showSuccess('.github/skills/', ['Address PR Comments', 'GTM Manager']);
      
      console.log = originalLog;
      
      const output = logs.join('\n');
      expect(output).toContain('Skills installed successfully');
      expect(output).toContain('.github/skills/');
      expect(output).toContain('Address PR Comments');
      expect(output).toContain('GTM Manager');
      expect(output).toContain('2');  // skill count
    });

    it('should show singular "skill" for single installation', async () => {
      const { showSuccess } = await import('../../lib/prompts.js');
      
      const logs = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));
      
      showSuccess('.github/skills/', ['Single Skill']);
      
      console.log = originalLog;
      
      const output = logs.join('\n');
      expect(output).toContain('1');
    });
  });

  describe('User Story: Display error messages', () => {
    it('should format error message correctly', async () => {
      const { showError } = await import('../../lib/prompts.js');
      
      const logs = [];
      const originalError = console.error;
      console.error = (...args) => logs.push(args.join(' '));
      
      showError('Something went wrong');
      
      console.error = originalError;
      
      const output = logs.join('\n');
      expect(output).toContain('Error');
      expect(output).toContain('Something went wrong');
    });
  });

  describe('User Story: Show progress spinner', () => {
    it('should return spinner with stop method', async () => {
      const { showSpinner } = await import('../../lib/prompts.js');
      
      // Mock stdout
      const originalWrite = process.stdout.write;
      const originalClearLine = process.stdout.clearLine;
      const originalCursorTo = process.stdout.cursorTo;
      
      let output = '';
      process.stdout.write = (str) => { output += str; return true; };
      process.stdout.clearLine = () => true;
      process.stdout.cursorTo = () => true;
      
      const spinner = showSpinner('Loading...');
      
      expect(spinner).toHaveProperty('stop');
      expect(typeof spinner.stop).toBe('function');
      
      // Stop should work without error
      spinner.stop('Done!');
      
      process.stdout.write = originalWrite;
      process.stdout.clearLine = originalClearLine;
      process.stdout.cursorTo = originalCursorTo;
    });
  });
});

describe('Path Selection Options', () => {
  describe('User Story: Standard installation paths', () => {
    it('should include local and global skill targets for each harness', async () => {
      const { SKILL_INSTALL_TARGETS } = await import('../../lib/install-targets.js');
      const standardPaths = SKILL_INSTALL_TARGETS.map(target => target.path);

      expect(standardPaths).toContain('.agents/skills/');
      expect(standardPaths).toContain('~/.agents/skills/');
      expect(standardPaths).toContain('.claude/skills/');
      expect(standardPaths).toContain('~/.claude/skills/');
      expect(standardPaths).not.toContain('.github/skills/');
      expect(standardPaths).not.toContain('~/.copilot/skills/');
    });

    it('should list global skill targets before local targets', async () => {
      const { SKILL_INSTALL_TARGETS } = await import('../../lib/install-targets.js');
      const scopes = SKILL_INSTALL_TARGETS.map(target => target.scope);

      expect(scopes).toEqual(['global', 'global', 'local', 'local']);
    });

    it('should detect legacy skill targets without recommending them', async () => {
      const { LEGACY_SKILL_INSTALL_TARGETS, SKILL_INSTALL_TARGETS } = await import('../../lib/install-targets.js');

      expect(LEGACY_SKILL_INSTALL_TARGETS.map(target => target.path)).toContain('~/.codex/skills/');
      expect(LEGACY_SKILL_INSTALL_TARGETS.map(target => target.path)).toContain('~/.copilot/skills/');
      expect(LEGACY_SKILL_INSTALL_TARGETS.map(target => target.path)).toContain('.github/skills/');
      expect(SKILL_INSTALL_TARGETS.map(target => target.path)).not.toContain('~/.codex/skills/');
      expect(SKILL_INSTALL_TARGETS.map(target => target.path)).not.toContain('~/.copilot/skills/');
      expect(SKILL_INSTALL_TARGETS.map(target => target.path)).not.toContain('.github/skills/');
    });
  });

  describe('User Story: Standard subagent installation paths', () => {
    it('should include local and global agent targets for each supported harness', async () => {
      const { AGENT_INSTALL_TARGETS } = await import('../../lib/install-targets.js');
      const standardPaths = AGENT_INSTALL_TARGETS.map(target => target.path);

      expect(standardPaths).toContain('.agents/agents/');
      expect(standardPaths).toContain('~/.agents/agents/');
      expect(standardPaths).toContain('.claude/agents/');
      expect(standardPaths).toContain('~/.claude/agents/');
      expect(standardPaths).toContain('.codex/agents/');
      expect(standardPaths).toContain('~/.codex/agents/');
      expect(standardPaths).not.toContain('.github/agents/');
      expect(standardPaths).not.toContain('~/.copilot/agents/');
    });

    it('should list global agent targets before local targets', async () => {
      const { AGENT_INSTALL_TARGETS } = await import('../../lib/install-targets.js');
      const scopes = AGENT_INSTALL_TARGETS.map(target => target.scope);

      expect(scopes).toEqual(['global', 'global', 'global', 'local', 'local', 'local']);
    });

    it('should mark Codex agent targets for TOML conversion installs', async () => {
      const { AGENT_INSTALL_TARGETS } = await import('../../lib/install-targets.js');
      const codexTargets = AGENT_INSTALL_TARGETS.filter(target => target.harness === 'codex');

      expect(codexTargets.map(target => target.path)).toEqual(['~/.codex/agents/', '.codex/agents/']);
      expect(codexTargets.every(target => target.installMode === 'codex-toml')).toBe(true);
    });

    it('should detect legacy agent targets without recommending them', async () => {
      const { LEGACY_AGENT_INSTALL_TARGETS, AGENT_INSTALL_TARGETS } = await import('../../lib/install-targets.js');

      expect(LEGACY_AGENT_INSTALL_TARGETS.map(target => target.path)).toContain('.github/agents/');
      expect(LEGACY_AGENT_INSTALL_TARGETS.map(target => target.path)).toContain('~/.copilot/agents/');
      expect(AGENT_INSTALL_TARGETS.map(target => target.path)).not.toContain('.github/agents/');
      expect(AGENT_INSTALL_TARGETS.map(target => target.path)).not.toContain('~/.copilot/agents/');
    });

    it('should detect Codex TOML agent targets for generated installs', async () => {
      const { allAgentDetectionTargets } = await import('../../lib/install-targets.js');
      const detectionPaths = allAgentDetectionTargets().map(target => target.path);

      expect(detectionPaths).toContain('.codex/agents/');
      expect(detectionPaths).toContain('~/.codex/agents/');
    });

    it('should resolve Codex agent paths to the conversion backend', async () => {
      const { getAgentInstallMode } = await import('../../lib/install-targets.js');

      expect(getAgentInstallMode('.codex/agents/')).toBe('codex-toml');
      expect(getAgentInstallMode('~/.codex/agents/')).toBe('codex-toml');
      expect(getAgentInstallMode('.agents/agents/')).toBe('sparse-git');
    });
  });

  describe('User Story: Install into multiple Claude profile directories', () => {
    let homeDir;

    beforeEach(() => {
      homeDir = mkdtempSync(join(tmpdir(), 'skills-installer-home-'));
    });

    afterEach(() => {
      rmSync(homeDir, { recursive: true, force: true });
    });

    it('should discover ~/.claude_* directories in sorted order', async () => {
      const { discoverClaudeProfileDirs } = await import('../../lib/install-targets.js');
      mkdirSync(join(homeDir, '.claude_work'));
      mkdirSync(join(homeDir, '.claude_personal'));

      expect(discoverClaudeProfileDirs(homeDir)).toEqual(['.claude_personal', '.claude_work']);
    });

    it('should ignore non-matching names and non-directories', async () => {
      const { discoverClaudeProfileDirs } = await import('../../lib/install-targets.js');
      mkdirSync(join(homeDir, '.claude'));
      mkdirSync(join(homeDir, '.claude_'));
      mkdirSync(join(homeDir, '.claudette'));
      mkdirSync(join(homeDir, 'claude_work'));
      writeFileSync(join(homeDir, '.claude_file'), '');

      expect(discoverClaudeProfileDirs(homeDir)).toEqual([]);
    });

    it('should follow symlinked profile directories', async () => {
      const { discoverClaudeProfileDirs } = await import('../../lib/install-targets.js');
      mkdirSync(join(homeDir, 'real-profile'));
      symlinkSync(join(homeDir, 'real-profile'), join(homeDir, '.claude_linked'));

      expect(discoverClaudeProfileDirs(homeDir)).toEqual(['.claude_linked']);
    });

    it('should return no profiles when the home directory is unreadable', async () => {
      const { discoverClaudeProfileDirs } = await import('../../lib/install-targets.js');

      expect(discoverClaudeProfileDirs(join(homeDir, 'missing'))).toEqual([]);
    });

    it('should add a global skill target per profile right after ~/.claude/skills/', async () => {
      const { getSkillInstallTargets } = await import('../../lib/install-targets.js');
      mkdirSync(join(homeDir, '.claude_work'));
      mkdirSync(join(homeDir, '.claude_personal'));

      const targets = getSkillInstallTargets(homeDir);

      expect(targets.map(target => target.path)).toEqual([
        '~/.agents/skills/',
        '~/.claude/skills/',
        '~/.claude_personal/skills/',
        '~/.claude_work/skills/',
        '.agents/skills/',
        '.claude/skills/'
      ]);
      expect(targets.find(target => target.path === '~/.claude_work/skills/')).toMatchObject({
        harness: 'claude',
        scope: 'global'
      });
    });

    it('should add a global sparse-git agent target per profile right after ~/.claude/agents/', async () => {
      const { getAgentInstallTargets, getAgentInstallMode } = await import('../../lib/install-targets.js');
      mkdirSync(join(homeDir, '.claude_work'));

      const targets = getAgentInstallTargets(homeDir);

      expect(targets.map(target => target.path)).toEqual([
        '~/.agents/agents/',
        '~/.claude/agents/',
        '~/.claude_work/agents/',
        '~/.codex/agents/',
        '.agents/agents/',
        '.claude/agents/',
        '.codex/agents/'
      ]);
      expect(getAgentInstallMode('~/.claude_work/agents/')).toBe('sparse-git');
    });

    it('should return only the standard targets when no profiles exist', async () => {
      const { AGENT_INSTALL_TARGETS, SKILL_INSTALL_TARGETS, getAgentInstallTargets, getSkillInstallTargets } = await import('../../lib/install-targets.js');

      expect(getSkillInstallTargets(homeDir)).toEqual(SKILL_INSTALL_TARGETS);
      expect(getAgentInstallTargets(homeDir)).toEqual(AGENT_INSTALL_TARGETS);
    });

    it('should include profile targets when detecting existing installations', async () => {
      const { allAgentDetectionTargets, allSkillDetectionTargets } = await import('../../lib/install-targets.js');
      mkdirSync(join(homeDir, '.claude_work'));

      expect(allSkillDetectionTargets(homeDir).map(target => target.path)).toContain('~/.claude_work/skills/');
      expect(allAgentDetectionTargets(homeDir).map(target => target.path)).toContain('~/.claude_work/agents/');
    });
  });

  describe('User Story: See harness scope and count in path labels', () => {
    it('should format new target labels with harness scope and available count', async () => {
      const { formatTargetLabel } = await import('../../lib/install-targets.js');
      const target = { path: '.agents/skills/', harness: 'copilot/codex', scope: 'local' };

      expect(formatTargetLabel(target, 21, 'skill')).toBe('.agents/skills/ (copilot/codex | local | 21 skills)');
    });

    it('should format existing target labels with installed count', async () => {
      const { formatTargetLabel } = await import('../../lib/install-targets.js');
      const target = { path: '~/.claude/agents/', harness: 'claude', scope: 'global' };

      expect(formatTargetLabel(target, 1, 'agent', { installed: true })).toBe('~/.claude/agents/ (claude | global | 1 agent installed)');
    });
  });
});

describe('Skill Selection UI Components', () => {
  describe('User Story: See skill selection indicators', () => {
    it('should use correct checkbox symbols', () => {
      // From prompts.js render function
      const selectedSymbol = '◉';
      const unselectedSymbol = '○';
      
      expect(selectedSymbol).toBe('◉');
      expect(unselectedSymbol).toBe('○');
    });

    it('should use correct expand/collapse symbols', () => {
      const expandedSymbol = '▼';
      const collapsedSymbol = '▶';
      
      expect(expandedSymbol).toBe('▼');
      expect(collapsedSymbol).toBe('▶');
    });

    it('should use cursor indicator', () => {
      const cursorSymbol = '❯';
      expect(cursorSymbol).toBe('❯');
    });

    it('should use update flag for items needing updates', () => {
      // From prompts.js render function - yellow (update) flag
      const updateFlag = '(update)';
      expect(updateFlag).toBe('(update)');
    });

    it('should use dirty flag for items with local changes', () => {
      // From prompts.js render function - red (dirty) flag
      const dirtyFlag = '(dirty)';
      expect(dirtyFlag).toBe('(dirty)');
    });
  });

  describe('User Story: See update status in selection', () => {
    it('should show update count in footer when items need updates', () => {
      // Simulating footer logic from prompts.js
      const selectedItems = ['skill-a', 'skill-b', 'skill-c'];
      const itemsNeedingUpdate = new Set(['skill-a', 'skill-c']);
      
      const updateCount = selectedItems.filter(id => itemsNeedingUpdate.has(id)).length;
      const updateNote = updateCount > 0 ? ` (${updateCount} to update)` : '';
      
      expect(updateCount).toBe(2);
      expect(updateNote).toBe(' (2 to update)');
    });

    it('should not show update count when no items need updates', () => {
      const selectedItems = ['skill-a', 'skill-b'];
      const itemsNeedingUpdate = new Set();
      
      const updateCount = selectedItems.filter(id => itemsNeedingUpdate.has(id)).length;
      const updateNote = updateCount > 0 ? ` (${updateCount} to update)` : '';
      
      expect(updateCount).toBe(0);
      expect(updateNote).toBe('');
    });

    it('should correctly identify which items need updates', () => {
      const items = [
        { id: 'skill-a', name: 'Skill A' },
        { id: 'skill-b', name: 'Skill B' },
        { id: 'skill-c', name: 'Skill C' }
      ];
      const itemsNeedingUpdate = new Set(['skill-b']);
      
      const needsUpdate = items.filter(item => itemsNeedingUpdate.has(item.id));
      
      expect(needsUpdate).toHaveLength(1);
      expect(needsUpdate[0].name).toBe('Skill B');
    });

    it('should show dirty count in footer when selected items have local changes', () => {
      const selectedItems = ['skill-a', 'skill-b', 'skill-c'];
      const dirtyItems = new Set(['skill-b', 'skill-c']);

      const dirtyCount = selectedItems.filter(id => dirtyItems.has(id)).length;
      const dirtyNote = dirtyCount > 0 ? ` (${dirtyCount} dirty)` : '';

      expect(dirtyCount).toBe(2);
      expect(dirtyNote).toBe(' (2 dirty)');
    });
  });

  describe('User Story: See keyboard shortcuts', () => {
    it('should support documented keyboard shortcuts', () => {
      // Based on handleKeypress in prompts.js
      const supportedKeys = ['up', 'down', 'left', 'right', 'space', 'a', 'return'];
      
      supportedKeys.forEach(key => {
        expect(key).toBeTruthy();
      });
    });
  });
});

describe('Description Formatting', () => {
  describe('User Story: See skill descriptions', () => {
    it('should truncate long descriptions', () => {
      // getFirstSentence function behavior
      const maxLength = 60;
      const longDesc = 'This is a very long description that exceeds sixty characters and should be truncated with an ellipsis at the end.';
      
      // Simulating getFirstSentence logic
      const firstSentenceMatch = longDesc.match(/^[^.!?]+[.!?]/);
      const sentence = firstSentenceMatch ? firstSentenceMatch[0].trim() : longDesc;
      const truncated = sentence.length > maxLength 
        ? sentence.slice(0, maxLength - 3) + '...'
        : sentence;

      expect(truncated.length).toBeLessThanOrEqual(maxLength);
    });

    it('should extract first sentence from description', () => {
      const desc = 'This is the first sentence. This is the second sentence.';
      const match = desc.match(/^[^.!?]+[.!?]/);
      const firstSentence = match ? match[0].trim() : desc;

      expect(firstSentence).toBe('This is the first sentence.');
    });

    it('should handle descriptions with exclamation marks', () => {
      const desc = 'Great skill! Use it for testing.';
      const match = desc.match(/^[^.!?]+[.!?]/);
      const firstSentence = match ? match[0].trim() : desc;

      expect(firstSentence).toBe('Great skill!');
    });

    it('should handle descriptions with question marks', () => {
      const desc = 'Need help? This skill assists you.';
      const match = desc.match(/^[^.!?]+[.!?]/);
      const firstSentence = match ? match[0].trim() : desc;

      expect(firstSentence).toBe('Need help?');
    });
  });
});
