# @supercorks/skills-installer

Interactive CLI installer for AI agent skills and subagents. Selectively install resources for GitHub Copilot, Codex, Claude, and other AI assistants using Git sparse-checkout.

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

2. **Choose installation path(s)** - Select one or more locations where resources should be installed:
   - `.github/skills/` (Copilot)
   - `~/.codex/skills/` (Codex)
   - `.claude/skills/` (Claude)
   - `.github/agents/` (Copilot)
   - `.agents/agents/` (Codex)
   - `.claude/agents/` (Claude)
   - Custom path of your choice

3. **Gitignore option** - Optionally add the installation path to `.gitignore`

4. **Select skills/subagents** - Interactive checkbox to pick what to install:
   - Use `↑`/`↓` to navigate
   - Use `SPACE` to toggle selection
   - Use `→` to expand and lazy-load descriptions
   - Use `A` to toggle all
   - Press `ENTER` to confirm

5. **Sparse clone** - Only downloads selected skills/subagents using Git sparse-checkout, keeping the download minimal while preserving full git functionality.

## Installed repositories

- Skills repo: [https://github.com/supercorks/agent-skills](https://github.com/supercorks/agent-skills)
- Subagents repo: [https://github.com/supercorks/subagents](https://github.com/supercorks/subagents)

## Features

- **Minimal download** - Uses `git clone --filter=blob:none` for efficient cloning
- **Push capable** - The sparse clone preserves the full git history, allowing you to commit and push changes
- **Auto-discovery** - Fetches the latest skill list from the repository
- **Recursive directory creation** - Custom paths are created automatically

## Requirements

- Node.js 18+
- Git

## Updating skills

Since the installation uses a sparse git checkout, you can pull updates:

```bash
cd .github/skills  # or wherever you installed
git pull
```

## Adding more skills later

You can add more skills to an existing installation:

```bash
cd .github/skills
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
