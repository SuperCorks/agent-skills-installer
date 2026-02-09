# @supercorks/skills-installer

Interactive CLI installer for AI agent skills. Selectively install skills for GitHub Copilot, Claude, and other AI assistants using Git sparse-checkout.

## Usage

```bash
npx @supercorks/skills-installer
```

Or explicitly with the `install` command:

```bash
npx @supercorks/skills-installer install
```

## What it does

1. **Choose installation path(s)** - Select one or more locations where skills should be installed:
   - `.github/skills/` (GitHub Copilot default)
   - `.agents/skills/` (Agent workspace skills)
   - `/etc/codex/skills/` (System-level skills)
   - `.claude/skills/` (Claude)
   - Custom path of your choice

2. **Gitignore option** - Optionally add the installation path to `.gitignore`

3. **Select skills** - Interactive checkbox to pick which skills to install:
   - Use `↑`/`↓` to navigate
   - Use `SPACE` to toggle selection
   - Use `A` to toggle all
   - Press `ENTER` to confirm

4. **Sparse clone** - Only downloads the selected skills using Git sparse-checkout, keeping the download minimal while preserving full git functionality.

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
