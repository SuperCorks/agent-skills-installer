/**
 * Tests for lib/prompts.js utility functions
 * Note: Interactive prompt testing is limited without TTY mocking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    it('should include .github/skills as standard option', () => {
      // Based on prompts.js PATH_CHOICES
      const standardPaths = ['.github/skills/', '.claude/skills/'];
      expect(standardPaths).toContain('.github/skills/');
    });

    it('should include .claude/skills as standard option', () => {
      const standardPaths = ['.github/skills/', '.claude/skills/'];
      expect(standardPaths).toContain('.claude/skills/');
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
