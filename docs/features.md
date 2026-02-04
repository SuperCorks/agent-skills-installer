# @supercorks/skills-installer Features

A comprehensive guide to all user-facing features and workflows.

## Overview

The skills-installer is an interactive CLI tool that allows users to install, update, and manage AI agent skills in their projects. It uses Git sparse-checkout to efficiently clone only the selected skills from the repository.

Prerequisites:
- Node.js >= 18
- `git` installed and available in `PATH`

---

## Installation Modes

### Fresh Installation

When no existing installation is detected, users go through the full installation flow:

1. **Fetch available skills** - Retrieves the list of skills from the GitHub repository
2. **Select installation path** - Choose where to install skills
3. **Configure .gitignore** - Option to exclude skills from version control
4. **Select skills** - Interactive skill picker
5. **Clone and checkout** - Performs sparse clone with selected skills

### Manage Existing Installation

When running in a directory with existing installations, users can modify their skill selection:

1. **Detect existing installations** - Scans common paths for existing skill repos
2. **Select installation to manage** - Shows existing installations with skill counts
3. **Modify skill selection** - Pre-selected checkboxes for installed skills
4. **Apply changes** - Updates sparse-checkout configuration
   - Adds newly selected skills
   - Removes unchecked skills
   - Pulls latest updates first (best-effort)

Notes:
- “Manage mode” is entered whenever the selected install path is already a git repo and the installer can read a non-empty sparse-checkout configuration.
- If you pick “Custom path…” and the path already contains a skills repo, the installer will also treat it as an existing installation.

---

## User Flows

### Path Selection

Users can install skills to:

| Option | Path | Description |
|--------|------|-------------|
| GitHub Skills | `.github/skills/` | Standard location for GitHub-aware tools |
| Claude Skills | `.claude/skills/` | Standard location for Claude/Anthropic tools |
| Custom | User-defined | Any custom path |

When existing installations are detected, they appear at the top of the list with skill counts:
```
? Select an existing installation to manage, or choose a new location:
❯ .github/skills/ (2 skills installed)
  ── New installation ──
  .claude/skills/
  Custom path...
```

If you choose a new location, the installer will create the directory if needed.

### Skill Selection Interface

The interactive skill picker supports:

| Key | Action |
|-----|--------|
| ↑/↓ | Navigate between skills |
| Space | Toggle skill selection |
| → | Expand skill description |
| ← | Collapse skill description |
| A | Toggle all skills |
| Enter | Confirm selection |
| Ctrl+C | Cancel |

Display format:
- `◉` Selected skill
- `○` Unselected skill
- `▶` Collapsed (short description shown)
- `▼` Expanded (full description shown)

### .gitignore Integration

For fresh installations, users are prompted:
```
? Add ".github/skills/" to .gitignore?
```

This prevents the cloned skills from being committed to the user's repository while keeping them available locally.

If accepted, the installer adds an entry like:
- `# AI Agent Skills`
- `<install-path>/`

---

## Output & Feedback

At startup, the CLI prints a short banner:
```
🔧 AI Agent Skills Installer
```

### Fresh Installation Success

```
══════════════════════════════════════════════════
✅ Skills installed successfully!
══════════════════════════════════════════════════

📁 Location: .github/skills/

📦 Installed skills (2):
   • Address PR Comments
   • GTM Manager

🚀 Your AI agent will automatically discover these skills.
══════════════════════════════════════════════════
```

If you opt into `.gitignore` integration, you’ll also see one of these messages:
- `✅ Added "<install-path>/" to .gitignore`
- `ℹ️  "<install-path>" is already in .gitignore`

### Manage Mode Success

```
══════════════════════════════════════════════════
✅ Skills updated successfully!
══════════════════════════════════════════════════

📁 Location: .github/skills/

➕ Added (1):
   • GTM Manager

➖ Removed (1):
   • Old Skill

📦 Unchanged (1):
   • Address PR Comments

🚀 3 skills now installed.
══════════════════════════════════════════════════
```

### Progress Indicators

- Spinner animation during key network/git operations
- Step-by-step progress messages during clone/update (printed as each git step begins):
   - "Initializing sparse clone..."
   - "Configuring sparse-checkout..."
   - "Checking out files..."
   - "Pulling latest changes..."
   - "Updating sparse-checkout configuration..."
   - "Applying changes..."

After confirming skill selection, the picker clears the screen and prints a final selection summary:
```
📦 Selected skills:
   ✓ <Skill Name>
```

---

## CLI Interface

### Commands

```bash
# Interactive installation (default)
npx @supercorks/skills-installer

# Explicit install command
npx @supercorks/skills-installer install

# Show help
npx @supercorks/skills-installer --help

# (Aliases)
npx @supercorks/skills-installer -h

# Show version
npx @supercorks/skills-installer --version

# (Aliases)
npx @supercorks/skills-installer -v
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (git not available, fetch failed, install/update failed, unknown command, etc.) |

---

## Technical Details

### Skill Detection

Skills are detected from the repository by:
1. Listing all directories at the repository root via the GitHub Contents API
2. Filtering out excluded folders (`.github`, `.claude`, `node_modules`, hidden folders)
3. Checking each directory for a `SKILL.md` file
4. Parsing name/description from `SKILL.md` frontmatter

Frontmatter formats supported:
- A ```skill fenced block containing `---` frontmatter
- Standard leading `---` frontmatter

### Sparse Checkout

The installer uses Git sparse-checkout in non-cone mode for precise control:
- Only selected skill folders are checked out
- Root-level files (README, etc.) are excluded
- Clone uses `--filter=blob:none` + sparse checkout (minimizes blob download)
- Full git history is preserved for updates (it is a normal git clone)

### Existing Installation Detection

Scans these common paths for `.git` directories:
- `.github/skills/`
- `.claude/skills/`

Additionally, if you choose a custom path and it is already a git repo, the installer will attempt to read the currently checked-out skills from its sparse-checkout config.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Git not installed | Error message with instructions |
| Network failure | Error with details, graceful exit |
| GitHub API failure/rate limit | Error with HTTP status and message, graceful exit |
| No skills found | Error message |
| User cancels (Ctrl+C) | "Installation cancelled" message |
| No skills selected | Inline error, prevents confirmation |
| Target path already a git repo (fresh install) | Error message; user must choose a different path |
| Target path exists and is not empty | Installation fails (git clone cannot proceed); choose an empty/new directory |
| Target path is a git repo but not a skills installation | May be treated as fresh install and then fail due to existing repo; choose a different path |
| Unknown command | Prints usage and exits with error |
