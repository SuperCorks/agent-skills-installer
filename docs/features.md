# @supercorks/skills-installer Features

A comprehensive guide to all user-facing features and workflows.

## Overview

The skills-installer is an interactive CLI tool that allows users to install, update, and manage AI agent skills and subagents in their projects. It uses Git sparse-checkout to efficiently clone only the selected items from the respective repositories.

**Supported resources:**
- **Skills** - Domain-specific knowledge files from `@supercorks/agent-skills`
- **Subagents** - Specialized AI agents from `@supercorks/subagents`

---

## Installation Type Selection

When running the installer, users first choose what to install:

| Option | Description |
|--------|-------------|
| Skills only | Install skills from @supercorks/agent-skills |
| Subagents only | Install subagents from @supercorks/subagents |
| Both skills and subagents | Install both resources |

---

## Installation Modes

### Fresh Installation

When no existing installation is detected, users go through the full installation flow:

1. **Fetch available skills** - Retrieves the list of skills from the GitHub repository
2. **Select installation path(s)** - Choose one or more locations to install skills
3. **Configure .gitignore** - Option to exclude skills from version control
4. **Select skills** - Interactive skill picker
5. **Clone and checkout** - Performs sparse clone with selected skills

### Manage Existing Installation

When running in a directory with existing installations, users can modify their skill selection:

1. **Detect existing installations** - Scans common paths for existing skill repos
2. **Select installation(s) to manage** - Shows existing installations with skill counts
3. **Modify skill selection** - Pre-selected checkboxes for installed skills
4. **Apply changes** - Updates sparse-checkout configuration
   - Adds newly selected skills
   - Removes unchecked skills
   - Pulls latest updates for unchanged skills

---

## User Flows

### Path Selection

#### Skills Installation Paths

Users can install skills to:

| Option | Path | Description |
|--------|------|-------------|
| GitHub Skills | `.github/skills/` | Standard location for GitHub-aware tools |
| Agent Skills | `.agents/skills/` | Standard location for local agent workspace skills |
| System Skills | `/etc/codex/skills/` | System-level shared skills location |
| Claude Skills | `.claude/skills/` | Standard location for Claude/Anthropic tools |
| Custom | User-defined | Any custom path |

#### Subagents Installation Paths

Users can install subagents to:

| Option | Path | Description |
|--------|------|-------------|
| GitHub Agents | `.github/agents/` | Standard location for GitHub Copilot custom agents |
| Claude Agents | `.claude/agents/` | Standard location for Claude Code subagents |
| Custom | User-defined | Any custom path |

When existing installations are detected, they appear at the top of the list with counts:
```
? Select one or more installations to manage, or choose new locations:
❯ .github/skills/ (2 skills installed)
  ── New installation ──
  .agents/skills/
  /etc/codex/skills/
  .claude/skills/
  Custom path...
```

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
? Add ".github/skills/" to .gitignore? (Y/n)
```

This prevents the cloned skills from being committed to the user's repository while keeping them available locally.

---

## Output & Feedback

### Fresh Installation Success (Skills)

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

### Fresh Installation Success (Subagents)

```
══════════════════════════════════════════════════
✅ Subagents installed successfully!
══════════════════════════════════════════════════

📁 Location: .github/agents/

🤖 Installed subagents (3):
   • Developer
   • Architect
   • Tester

🚀 Your AI agent will automatically discover these subagents.
══════════════════════════════════════════════════
```

### Manage Mode Success (Skills)

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

### Manage Mode Success (Subagents)

```
══════════════════════════════════════════════════
✅ Subagents updated successfully!
══════════════════════════════════════════════════

📁 Location: .github/agents/

➕ Added (1):
   • Tester

➖ Removed (1):
   • Old Agent

🤖 Unchanged (2):
   • Developer
   • Architect

🚀 3 subagents now installed.
══════════════════════════════════════════════════
```

### Progress Indicators

- Spinner animation during network/git operations
- Step-by-step progress messages:
  - "Fetching available skills from repository..."
  - "Initializing sparse clone..."
  - "Configuring sparse-checkout..."
  - "Checking out files..."
  - "Pulling latest changes..."

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

# Show version
npx @supercorks/skills-installer --version
```

### Interactive Flow

1. **Select installation type** - Choose skills only, subagents only, or both
2. **Skills flow** (if selected):
   - Fetch available skills
   - Select installation path
   - Configure .gitignore (fresh install only)
   - Select skills
   - Clone and checkout
3. **Subagents flow** (if selected):
   - Fetch available subagents
   - Select installation path
   - Configure .gitignore (fresh install only)
   - Select subagents
   - Clone and checkout

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (git not available, fetch failed, installation failed, etc.) |

---

## Technical Details

### Skill Detection

Skills are detected from the repository by:
1. Listing all directories at the repository root
2. Filtering out excluded folders (`.github`, `.claude`, `node_modules`, hidden folders)
3. Checking each directory for a `SKILL.md` file
4. Parsing frontmatter from `SKILL.md` for name and description

### Subagent Detection

Subagents are detected from the repository by:
1. Listing all files at the repository root ending with `.agent.md`
2. Fetching and parsing the frontmatter from each file
3. Extracting name and description from YAML frontmatter (supports `---` and ` ```chatagent` formats)

### Sparse Checkout

The installer uses Git sparse-checkout in non-cone mode for precise control:
- Only selected skill folders or subagent files are checked out
- Root-level files (README, etc.) are excluded
- Full git history is preserved for updates

### Existing Installation Detection

**Skills** - Scans these common paths for `.git` directories:
- `.github/skills/`
- `.agents/skills/`
- `/etc/codex/skills/`
- `.claude/skills/`

**Subagents** - Scans these common paths for `.git` directories:
- `.github/agents/`
- `.claude/agents/`

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Git not installed | Error message with instructions |
| Network failure | Error with details, graceful exit |
| No skills found | Error message |
| User cancels (Ctrl+C) | "Installation cancelled" message |
| No skills selected | Inline error, prevents confirmation |
