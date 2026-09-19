# @supercorks/skills-installer

Interactive CLI installer for AI agent skills and subagents, with a non-interactive mode for coding agents and scripts. Selectively install resources for GitHub Copilot, Codex, Claude, and other AI assistants using Git sparse-checkout and Codex agent conversion where needed.

## Usage

```bash
npx @supercorks/skills-installer
```

Or explicitly with the `install` command:

```bash
npx @supercorks/skills-installer install
```

## What it does

1. **Choose installation type** - Install skills, subagents, or both.

2. **Choose installation path(s)** - Select one or more locations where resources should be installed. Global locations are shown before local locations. The installer labels each option with harness, scope, and available count, for example `~/.agents/skills/ (copilot/codex | global | 24 skills)`.

   Skills:
   - `~/.agents/skills/` (copilot/codex | global)
   - `~/.claude/skills/` (claude | global)
   - `~/.claude_*/skills/` (claude | global, one per matching profile directory found in your home directory)
   - `.agents/skills/` (copilot/codex | local)
   - `.claude/skills/` (claude | local)

   Agents:
   - `~/.agents/agents/` (copilot | global)
   - `~/.claude/agents/` (claude | global)
   - `~/.claude_*/agents/` (claude | global, one per matching profile directory found in your home directory)
   - `~/.codex/agents/` (codex | global, installed as converted TOML agents)
   - `.agents/agents/` (copilot | local)
   - `.claude/agents/` (claude | local)
   - `.codex/agents/` (codex | local, installed as converted TOML agents)
   - Custom path of your choice

3. **Gitignore option** - If launched from inside a git repository, optionally add the installation path to `.gitignore`

4. **Select skills/subagents** - Interactive checkbox to pick what to install. If multiple locations are selected, the installer asks once and applies the same selection to every selected location:
   - Use `↑`/`↓` to navigate
   - Use `SPACE` to toggle selection
   - Use `→` to expand and lazy-load descriptions
   - Use `A` to toggle all
   - Press `ENTER` to confirm

5. **Install backend**
   - Skills and Markdown-based agents use Git sparse-checkout for minimal download while preserving full git functionality.
   - Codex agents are generated as TOML files from the source Markdown agent definitions.

## Pinning a model and reasoning effort per harness

A subagent definition (`*.agent.md`) can pin a model and reasoning effort per harness using four flat frontmatter keys. Values may be quoted or unquoted.

| Key | Used by | Effect |
|-----|---------|--------|
| `model` | Claude Code / Copilot | Read natively from the Markdown; never copied into the Codex TOML |
| `effort` | Claude Code | `low`, `medium`, `high`, `xhigh`, `max`; also used as the Codex effort when `codex_effort` is absent |
| `codex_model` | Codex | Emitted as `model = "..."` in the generated TOML |
| `codex_effort` | Codex | Emitted as `model_reasoning_effort = "..."`; falls back to `effort` |

```markdown
---
name: conductor-implementer
description: Implements one agent-conductor task packet.
model: claude-opus-4-8
effort: xhigh
codex_model: gpt-5.6-sol
---
```

The example above generates `model = "gpt-5.6-sol"` and `model_reasoning_effort = "xhigh"` in the Codex TOML. Definitions without these keys convert exactly as before.

## Non-interactive mode (for coding agents and scripts)

Passing any of the flags below skips every prompt. Without a terminal and without flags the installer exits with a usage error instead of waiting on a prompt.

```bash
# What can be installed, and what is installed where (read-only)
npx @supercorks/skills-installer install --list --json

# Add skills / agents. Nothing already installed is removed.
npx @supercorks/skills-installer install --yes --skills frontend-design,feature-dev --path ~/.claude/skills
npx @supercorks/skills-installer install --yes --agents Architect,Tester --agents-path ~/.claude/agents
npx @supercorks/skills-installer install --yes --skills all --path .claude/skills --gitignore

# Remove, update
npx @supercorks/skills-installer install --yes --remove-skills boulevard --path ~/.claude/skills
npx @supercorks/skills-installer install --yes --update --path ~/.claude/skills
npx @supercorks/skills-installer install --yes --update --all
```

| Flag | Behaviour |
|------|-----------|
| `--list` | Read-only report: available skills/agents and, per install target, what is installed, has updates, or has local changes |
| `--skills <a,b\|all>` | Skills to add, by folder name (case-insensitive) |
| `--agents <a,b\|all>` | Agents to add: `Architect`, `code-quality` and `Code Quality.agent.md` all work |
| `--remove-skills`, `--remove-agents` | Remove only the named items. Names that are not installed are reported, not an error |
| `--exact` | Make `--skills` / `--agents` the full installed set, removing everything else (what the interactive picker does) |
| `--path <dir>` | Target directory, repeatable. Required for installs and removals. Used as the agents target when only agents are changed |
| `--agents-path <dir>` | Agents target directory, repeatable. Required when skills and agents change in the same command |
| `--update` | Pull the latest version of what is installed at the given paths |
| `--all` | With `--update`: refresh every detected installation |
| `--dry-run` | Report what would change without touching disk |
| `--gitignore` | Add a new local install path to `.gitignore`. Never done otherwise |
| `--json` | One JSON document on stdout; progress goes to stderr |
| `-y`, `--yes` | Accepted for clarity; this mode never prompts |

Selection is additive: `--skills` and `--agents` only add, `--remove-*` only removes, and an installation that already has the requested items is left untouched unless `--update` is passed.

Exit codes: `0` success, `1` runtime failure (network, git, local changes blocking an update), `2` usage error (bad flags, unknown skill, missing `--path`).

With `--json`, success looks like:

```json
{
  "ok": true,
  "dryRun": false,
  "results": [
    {
      "kind": "skills",
      "path": "~/.claude/skills",
      "absolutePath": "/Users/me/.claude/skills",
      "action": "updated",
      "added": ["feature-dev"],
      "removed": [],
      "notInstalled": [],
      "installed": ["frontend-design", "feature-dev"]
    }
  ]
}
```

`action` is one of `installed`, `updated`, `unchanged`, `would-install`, `would-update`. Failures look like:

```json
{
  "ok": false,
  "error": {
    "code": "UPDATE_FAILED",
    "message": "Could not update sparse checkout from origin/main. ...",
    "path": "~/.claude/skills",
    "dirty": ["frontend-design"],
    "completed": []
  }
}
```

Error codes: `USAGE`, `UNKNOWN_ITEM`, `EMPTY_SELECTION`, `NOT_INSTALLED`, `NOT_AN_INSTALLATION` (the path is a git repository that is not a skills/agents install, so it is never rewritten), `INSTALL_FAILED`, `UPDATE_FAILED`, `GIT_UNAVAILABLE`. The installer never discards local changes: a dirty or diverged checkout fails with `UPDATE_FAILED` and lists the dirty items.

## Installed repositories

- Skills repo: [https://github.com/supercorks/agent-skills](https://github.com/supercorks/agent-skills)
- Subagents repo: [https://github.com/supercorks/subagents](https://github.com/supercorks/subagents)

## Features

- **Minimal download** - Uses `git clone --filter=blob:none` for efficient cloning
- **Push capable** - The sparse clone preserves the full git history, allowing you to commit and push changes
- **Auto-discovery** - Fetches the latest skill list from the repository
- **Global and local targets** - Offers documented project/user locations for Copilot, Codex, and Claude where the resource format is compatible, with shared generic `~/.agents/skills/` and `.agents/skills/` targets for Copilot/Codex skills
- **Codex agent conversion** - Converts Markdown subagents into Codex TOML custom agents for `.codex/agents/` targets, including per-harness model/effort pinning
- **Recursive directory creation** - Custom paths are created automatically

## Requirements

- Node.js 18+
- Git

## Updating skills

Re-run the installer and pick the existing installation, or without prompts:

```bash
npx @supercorks/skills-installer install --update --all
```

Since the installation uses a sparse git checkout, you can also pull updates by hand:

```bash
cd .agents/skills  # or wherever you installed
git pull
```

## Adding more skills later

```bash
npx @supercorks/skills-installer install --skills new-skill-name --path .agents/skills
```

Or by hand:

```bash
cd .agents/skills
git sparse-checkout add new-skill-name
```

## Development

```bash
# Clone the repo
git clone https://github.com/supercorks/agent-skills-installer.git
cd agent-skills-installer

# Install dependencies
npm install

# Run locally
npm start
# or
node bin/install.js
```

## License

MIT
