# @supercorks/skills-installer

Interactive CLI installer for AI agent skills and subagents. Selectively install resources for GitHub Copilot, Codex, Claude, and other AI assistants using Git sparse-checkout and Codex agent conversion where needed.

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
   - `.agents/skills/` (copilot/codex | local)
   - `.claude/skills/` (claude | local)

   Agents:
   - `~/.agents/agents/` (copilot | global)
   - `~/.claude/agents/` (claude | global)
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

## Installed repositories

- Skills repo: [https://github.com/supercorks/agent-skills](https://github.com/supercorks/agent-skills)
- Subagents repo: [https://github.com/supercorks/subagents](https://github.com/supercorks/subagents)

## Features

- **Minimal download** - Uses `git clone --filter=blob:none` for efficient cloning
- **Push capable** - The sparse clone preserves the full git history, allowing you to commit and push changes
- **Auto-discovery** - Fetches the latest skill list from the repository
- **Global and local targets** - Offers documented project/user locations for Copilot, Codex, and Claude where the resource format is compatible, with shared generic `~/.agents/skills/` and `.agents/skills/` targets for Copilot/Codex skills
- **Codex agent conversion** - Converts Markdown subagents into Codex TOML custom agents for `.codex/agents/` targets
- **Recursive directory creation** - Custom paths are created automatically

## Requirements

- Node.js 18+
- Git

## Updating skills

Since the installation uses a sparse git checkout, you can pull updates:

```bash
cd .agents/skills  # or wherever you installed
git pull
```

## Adding more skills later

You can add more skills to an existing installation:

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
