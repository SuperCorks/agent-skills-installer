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
| Agents only | Install subagents from @supercorks/subagents |
| Skills and Agents | Install both resources |

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

| Harness | Scope | Path | Description |
|---------|-------|------|-------------|
| Copilot | Local | `.github/skills/` | Workspace/project skills |
| Copilot | Global | `~/.copilot/skills/` | Personal skills available across workspaces |
| Codex | Local | `.agents/skills/` | Repository skills discovered from the current directory up to the repo root |
| Codex | Global | `~/.agents/skills/` | User skills available across repositories |
| Claude | Local | `.claude/skills/` | Project skills |
| Claude | Global | `~/.claude/skills/` | Personal skills available across projects |
| Custom | Custom | User-defined | Any custom path |

Legacy installs at `~/.codex/skills/` are still detected so users can manage or migrate them, but new Codex installs use the current documented `~/.agents/skills/` path.

#### Subagents Installation Paths

Users can install subagents to:

| Harness | Scope | Path | Description |
|---------|-------|------|-------------|
| Copilot | Local | `.github/agents/` | Workspace custom agents |
| Copilot | Global | `~/.copilot/agents/` | Personal custom agents available across workspaces |
| Claude | Local | `.claude/agents/` | Project subagents |
| Claude | Global | `~/.claude/agents/` | Personal subagents available across projects |
| Codex | Local | `.codex/agents/` | Generated Codex TOML custom agents |
| Codex | Global | `~/.codex/agents/` | Generated Codex TOML custom agents |
| Custom | Custom | User-defined | Any custom path |

Codex custom agents are documented as TOML files under `.codex/agents/` or `~/.codex/agents/`. The installer converts the source Markdown `.agent.md` files into Codex TOML files on install. The initial converter maps `name`, `description`, and the Markdown body to `developer_instructions`; tool, model, and MCP-specific frontmatter are intentionally ignored for now. Legacy `.agents/agents/` installs are still detected for management.

When existing installations are detected, they appear at the top of the list with counts:
```
? Select one or more installations to manage, or choose new locations:
❯ .github/skills/ (copilot | local | 2 skills installed)
  ── New installation ──
   ~/.copilot/skills/ (copilot | global | 21 skills)
   .agents/skills/ (codex | local | 21 skills)
   ~/.agents/skills/ (codex | global | 21 skills)
   .claude/skills/ (claude | local | 21 skills)
   ~/.claude/skills/ (claude | global | 21 skills)
  Custom path...
```

### Skill Selection Interface

The interactive skill picker supports:

| Key | Action |
|-----|--------|
| ↑/↓ | Navigate between skills |
| Space | Toggle skill selection |
| → | Expand and lazy-load description |
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

For fresh installations launched inside a git repository, users are prompted:
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

1. **Select installation type** - Choose skills only, agents only, or both
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
   - Clone and checkout Markdown agents, or convert selected agents to Codex TOML for Codex targets

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
3. Returning immediate folder-derived display names
4. Loading and parsing `SKILL.md` frontmatter only when the user expands an item (`→`)

### Subagent Detection

Subagents are detected from the repository by:
1. Listing all files at the repository root ending with `.agent.md`
2. Returning immediate filename-derived display names
3. Fetching and parsing frontmatter only when the user expands an item (`→`)
4. Extracting name and description from YAML frontmatter (supports `---` and ` ```chatagent` formats)

### Install Backends

For skills and Markdown agent targets, the installer uses Git sparse-checkout in non-cone mode for precise control:
- Only selected skill folders or subagent files are checked out
- Root-level files (README, etc.) are excluded
- Full git history is preserved for updates

For Codex agent targets, the installer fetches selected Markdown `.agent.md` source files and writes generated TOML files:
- `.codex/agents/` for project-scoped Codex custom agents
- `~/.codex/agents/` for user-scoped Codex custom agents
- Generated files include a source marker so future runs can update/remove only installer-managed files
- Manual TOML files in the same directory are left untouched

### Existing Installation Detection

**Skills** - Scans these common paths for `.git` directories:
- `.github/skills/` (Copilot local)
- `~/.copilot/skills/` (Copilot global)
- `.agents/skills/` (Codex local)
- `~/.agents/skills/` (Codex global)
- `.claude/skills/` (Claude local)
- `~/.claude/skills/` (Claude global)
- `~/.codex/skills/` (legacy Codex global)

**Subagents** - Scans these common paths:
- `.github/agents/` (Copilot local sparse checkout)
- `~/.copilot/agents/` (Copilot global sparse checkout)
- `.claude/agents/` (Claude local sparse checkout)
- `~/.claude/agents/` (Claude global sparse checkout)
- `.codex/agents/` (Codex local generated TOML)
- `~/.codex/agents/` (Codex global generated TOML)
- `.agents/agents/` (legacy Codex local sparse checkout)

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Git not installed | Error message with instructions |
| Network failure | Error with details, graceful exit |
| No skills found | Error message |
| User cancels (Ctrl+C) | "Installation cancelled" message |
| No skills selected | Inline error, prevents confirmation |
