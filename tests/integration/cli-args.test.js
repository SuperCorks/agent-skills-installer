/**
 * Tests for lib/cli-args.js
 * Flag parsing and validation for the non-interactive mode
 */

import { describe, it, expect } from 'vitest';
import { EXIT_CODES, UsageError, parseCliArgs } from '../../lib/cli-args.js';

describe('CLI Argument Parsing', () => {
  describe('User Story: Keep the interactive wizard as the default', () => {
    it('should stay interactive with no arguments', () => {
      const cli = parseCliArgs([]);

      expect(cli.command).toBeNull();
      expect(cli.nonInteractive).toBe(false);
      expect(cli.options).toBeNull();
    });

    it('should stay interactive with the explicit install command', () => {
      const cli = parseCliArgs(['install']);

      expect(cli.command).toBe('install');
      expect(cli.nonInteractive).toBe(false);
    });

    it('should report help and version flags without validating anything else', () => {
      expect(parseCliArgs(['--help']).help).toBe(true);
      expect(parseCliArgs(['-h']).help).toBe(true);
      expect(parseCliArgs(['--version']).version).toBe(true);
      expect(parseCliArgs(['-v']).version).toBe(true);
      expect(parseCliArgs(['--help', '--skills', 'docs']).help).toBe(true);
    });

    it('should pass unknown commands through for the caller to reject', () => {
      expect(parseCliArgs(['foobar']).command).toBe('foobar');
    });
  });

  describe('User Story: Select items with flags', () => {
    it('should split comma-separated and repeated values and drop duplicates', () => {
      const { options, nonInteractive } = parseCliArgs([
        'install', '--yes', '--skills', 'docs, feature-dev', '--skills', 'docs,kernel', '--path', '~/.claude/skills'
      ]);

      expect(nonInteractive).toBe(true);
      expect(options.yes).toBe(true);
      expect(options.skills).toEqual(['docs', 'feature-dev', 'kernel']);
      expect(options.paths).toEqual(['~/.claude/skills']);
    });

    it('should switch to non-interactive mode without --yes', () => {
      expect(parseCliArgs(['--skills', 'docs', '--path', 'x']).nonInteractive).toBe(true);
    });

    it('should recognise the "all" keyword', () => {
      const { options } = parseCliArgs(['--skills', 'ALL', '--path', 'x']);

      expect(options.skills).toBe('all');
    });

    it('should reject "all" mixed with names', () => {
      expect(() => parseCliArgs(['--skills', 'all,docs', '--path', 'x'])).toThrow(UsageError);
    });

    it('should reject "all" for removals', () => {
      expect(() => parseCliArgs(['--remove-skills', 'all', '--path', 'x'])).toThrow(/not supported for removals/);
    });

    it('should use --path as the agents target when only agents change', () => {
      const { options } = parseCliArgs(['--agents', 'Architect', '--path', '~/.claude/agents']);

      expect(options.agents).toEqual(['Architect']);
      expect(options.paths).toEqual(['~/.claude/agents']);
    });

    it('should parse every boolean flag', () => {
      const { options } = parseCliArgs(['--skills', 'docs', '--path', 'x', '--exact', '--dry-run', '--gitignore', '--json', '--update']);

      expect(options).toMatchObject({ exact: true, dryRun: true, gitignore: true, json: true, update: true });
    });
  });

  describe('User Story: Get a usage error instead of a guess', () => {
    const usageError = (argv) => {
      try {
        parseCliArgs(argv);
      } catch (error) {
        return error;
      }
      return null;
    };

    it('should exit with the usage code', () => {
      const error = usageError(['--skills', 'docs']);

      expect(error).toBeInstanceOf(UsageError);
      expect(error.exitCode).toBe(EXIT_CODES.USAGE);
      expect(error.code).toBe('USAGE');
    });

    it('should require --path for skill changes', () => {
      expect(usageError(['--skills', 'docs']).message).toMatch(/--path is required/);
      expect(usageError(['--remove-skills', 'docs']).message).toMatch(/--path is required/);
    });

    it('should require a target for agent changes', () => {
      expect(usageError(['--agents', 'Architect']).message).toMatch(/--agents-path \(or --path\) is required/);
    });

    it('should require --agents-path when skills and agents change together', () => {
      expect(usageError(['--skills', 'docs', '--agents', 'Architect', '--path', 'x']).message)
        .toMatch(/--agents-path is required when skills and agents/);
    });

    it('should reject unknown flags', () => {
      expect(usageError(['--bogus'])).toBeInstanceOf(UsageError);
    });

    it('should reject flags without an action', () => {
      expect(usageError(['--yes']).message).toMatch(/Nothing to do/);
      expect(usageError(['--path', 'x']).message).toMatch(/Nothing to do/);
    });

    it('should reject an empty selection value', () => {
      expect(usageError(['--skills', ' , ', '--path', 'x']).message).toMatch(/needs at least one name/);
    });

    it('should keep --list read-only', () => {
      expect(usageError(['--list', '--skills', 'docs', '--path', 'x']).message).toMatch(/read-only/);
      expect(usageError(['--list', '--update']).message).toMatch(/read-only/);
      expect(parseCliArgs(['--list', '--json', '--path', 'x']).options.list).toBe(true);
    });

    it('should require --skills or --agents with --exact', () => {
      expect(usageError(['--exact', '--update', '--path', 'x']).message).toMatch(/--exact needs/);
      expect(usageError(['--exact', '--skills', 'a', '--remove-skills', 'b', '--path', 'x']).message).toMatch(/cannot be combined/);
    });

    it('should only allow --all with a bare --update', () => {
      expect(usageError(['--all']).message).toMatch(/Nothing to do/);
      expect(usageError(['--all', '--skills', 'docs', '--path', 'x']).message).toMatch(/only valid with --update/);
      expect(usageError(['--update', '--all', '--path', 'x']).message).toMatch(/cannot be combined with --path/);
      expect(usageError(['--update', '--all', '--skills', 'docs']).message).toMatch(/cannot be combined with selection flags/);
      expect(parseCliArgs(['--update', '--all']).options.all).toBe(true);
    });

    it('should require a target for --update', () => {
      expect(usageError(['--update']).message).toMatch(/--update needs --path, --agents-path or --all/);
      expect(parseCliArgs(['--update', '--agents-path', 'x']).options.agentsPaths).toEqual(['x']);
    });
  });
});
