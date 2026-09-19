/**
 * Command line parsing for the interactive wizard and the non-interactive mode
 */

import { parseArgs } from 'util';

export const EXIT_CODES = {
  OK: 0,
  FAILURE: 1,
  USAGE: 2
};

/**
 * Invalid flags or flag combinations. Exits with EXIT_CODES.USAGE.
 */
export class UsageError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'UsageError';
    this.code = 'USAGE';
    this.exitCode = EXIT_CODES.USAGE;
    this.details = details;
  }
}

const ALL_KEYWORD = 'all';

const OPTION_CONFIG = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  yes: { type: 'boolean', short: 'y' },
  skills: { type: 'string', multiple: true },
  agents: { type: 'string', multiple: true },
  'remove-skills': { type: 'string', multiple: true },
  'remove-agents': { type: 'string', multiple: true },
  exact: { type: 'boolean' },
  path: { type: 'string', multiple: true },
  'agents-path': { type: 'string', multiple: true },
  update: { type: 'boolean' },
  all: { type: 'boolean' },
  list: { type: 'boolean' },
  json: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
  gitignore: { type: 'boolean' }
};

// Flags that do not, on their own, switch the CLI out of the interactive wizard
const NEUTRAL_FLAGS = new Set(['help', 'version']);

function splitList(values = []) {
  const items = values
    .flatMap(value => value.split(','))
    .map(item => item.trim())
    .filter(Boolean);
  return Array.from(new Set(items));
}

function parseSelection(values, flag) {
  const items = splitList(values);
  if (values && values.length > 0 && items.length === 0) {
    throw new UsageError(`--${flag} needs at least one name (comma-separated) or "${ALL_KEYWORD}".`);
  }

  const hasAll = items.some(item => item.toLowerCase() === ALL_KEYWORD);
  if (hasAll && items.length > 1) {
    throw new UsageError(`--${flag} ${ALL_KEYWORD} cannot be combined with other names.`);
  }

  return hasAll ? ALL_KEYWORD : items;
}

function hasSelection(selection) {
  return selection === ALL_KEYWORD || selection.length > 0;
}

/**
 * Parse process arguments
 * @param {string[]} argv - Arguments after the node binary and script path
 * @returns {{command: string|null, help: boolean, version: boolean, nonInteractive: boolean, options: object}}
 */
export function parseCliArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTION_CONFIG, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error.message);
  }

  const { values, positionals } = parsed;
  const nonInteractive = Object.keys(values).some(name => !NEUTRAL_FLAGS.has(name));

  const result = {
    command: positionals[0] || null,
    help: Boolean(values.help),
    version: Boolean(values.version),
    nonInteractive,
    options: null
  };

  // Unknown commands are rejected by the caller before any flag is looked at
  const isInstallCommand = result.command === null || result.command === 'install';
  if (result.help || result.version || !nonInteractive || !isInstallCommand) {
    return result;
  }

  const options = {
    yes: Boolean(values.yes),
    skills: parseSelection(values.skills, 'skills'),
    agents: parseSelection(values.agents, 'agents'),
    removeSkills: parseSelection(values['remove-skills'], 'remove-skills'),
    removeAgents: parseSelection(values['remove-agents'], 'remove-agents'),
    exact: Boolean(values.exact),
    paths: splitList(values.path),
    agentsPaths: splitList(values['agents-path']),
    update: Boolean(values.update),
    all: Boolean(values.all),
    list: Boolean(values.list),
    json: Boolean(values.json),
    dryRun: Boolean(values['dry-run']),
    gitignore: Boolean(values.gitignore)
  };

  validateOptions(options);
  result.options = options;
  return result;
}

function validateOptions(options) {
  const addsSkills = hasSelection(options.skills);
  const addsAgents = hasSelection(options.agents);
  const removesSkills = hasSelection(options.removeSkills);
  const removesAgents = hasSelection(options.removeAgents);
  const changesSkills = addsSkills || removesSkills;
  const changesAgents = addsAgents || removesAgents;
  const changesSelection = changesSkills || changesAgents;

  if (options.removeSkills === ALL_KEYWORD || options.removeAgents === ALL_KEYWORD) {
    throw new UsageError(`"${ALL_KEYWORD}" is not supported for removals. Name the items to remove, or delete the installation directory.`);
  }

  if (options.list) {
    if (changesSelection || options.update || options.exact || options.all || options.dryRun || options.gitignore) {
      throw new UsageError('--list is read-only and can only be combined with --json, --path and --agents-path.');
    }
    return;
  }

  if (!changesSelection && !options.update) {
    throw new UsageError('Nothing to do. Pass --list, --skills, --agents, --remove-skills, --remove-agents or --update.');
  }

  if (options.exact) {
    if (!addsSkills && !addsAgents) {
      throw new UsageError('--exact needs --skills and/or --agents to define the full installed set.');
    }
    if (removesSkills || removesAgents) {
      throw new UsageError('--exact cannot be combined with --remove-skills or --remove-agents.');
    }
  }

  if (options.all) {
    if (!options.update) {
      throw new UsageError('--all is only valid with --update.');
    }
    if (changesSelection) {
      throw new UsageError('--update --all refreshes every detected installation and cannot be combined with selection flags.');
    }
    if (options.paths.length > 0 || options.agentsPaths.length > 0) {
      throw new UsageError('--all cannot be combined with --path or --agents-path.');
    }
    return;
  }

  if (changesSkills && options.paths.length === 0) {
    throw new UsageError('--path is required when installing or removing skills. Run with --list to see valid targets.');
  }

  if (changesAgents && options.agentsPaths.length === 0 && (changesSkills || options.paths.length === 0)) {
    throw new UsageError(
      changesSkills
        ? '--agents-path is required when skills and agents are changed in the same command.'
        : '--agents-path (or --path) is required when installing or removing agents. Run with --list to see valid targets.'
    );
  }

  if (!changesSelection && options.update && options.paths.length === 0 && options.agentsPaths.length === 0) {
    throw new UsageError('--update needs --path, --agents-path or --all.');
  }
}

export { ALL_KEYWORD };
