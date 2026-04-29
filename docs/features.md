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
4. **Select skills** - Interactive skill picker, shown once even when multiple paths were selected
5. **Clone and checkout** - Performs sparse clone with selected skills in each selected path

### Manage Existing Installation

When running in a directory with existing installations, users can modify their skill selection:

1. **Detect existing installations** - Scans common paths for existing skill repos
2. **Select installation(s) to manage** - Shows standard global paths first, then standard local paths, then any legacy/custom existing installations with counts
3. **Modify skill selection** - Pre-selected checkboxes for the union of installed skills across selected paths
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
| Copilot/Codex | Global | `~/.agents/skills/` | Shared user skills available across repositories/workspaces |
| Claude | Global | `~/.claude/skills/` | Personal skills available across projects |
| Copilot/Codex | Local | `.agents/skills/` | Repository/workspace skills |
| Claude | Local | `.claude/skills/` | Project skills |
| Custom | Custom | User-defined | Any custom path |

Legacy installs at `.github/skills/`, `~/.copilot/skills/`, and `~/.codex/skills/` are still detected so users can manage or migrate them, but new Copilot/Codex installs use the shared generic `.agents/skills/` and `~/.agents/skills/` paths.

#### Subagents Installation Paths

Users can install subagents to:

| Harness | Scope | Path | Description |
|---------|-------|------|-------------|
| Copilot | Global | `~/.agents/agents/` | Personal custom agents available across workspaces |
| Claude | Global | `~/.claude/agents/` | Personal subagents available across projects |
| Codex | Global | `~/.codex/agents/` | Generated Codex TOML custom agents |
| Copilot | Local | `.agents/agents/` | Workspace custom agents |
| Claude | Local | `.claude/agents/` | Project subagents |
| Codex | Local | `.codex/agents/` | Generated Codex TOML custom agents |
| Custom | Custom | User-defined | Any custom path |

Codex custom agents are documented as TOML files under `.codex/agents/` or `~/.codex/agents/`. The installer converts the source Markdown `.agent.md` files into Codex TOML files on install. The initial converter maps `name`, `description`, and the Markdown body to `developer_instructions`; tool, model, and MCP-specific frontmatter are intentionally ignored for now. Legacy `.github/agents/` and `~/.copilot/agents/` installs are still detected for management.

When existing installations are detected, standard locations stay in global-first order and show installed counts. Legacy/custom installs appear in a separate section:
```
? Select one or more installations to manage, or choose new locations:
❯ ~/.agents/skills/ (copilot/codex | global | 24 skills)
   ~/.claude/skills/ (claude | global | 24 skills)
   .agents/skills/ (copilot/codex | local | 2 skills installed)
   .claude/skills/ (claude | local | 24 skills)
   ── Existing legacy/custom installations ──
   .github/skills/ (copilot | legacy local | 2 skills installed)
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
? Add ".agents/skills/" to .gitignore? (Y/n)
```

This prevents the cloned skills from being committed to the user's repository while keeping them available locally.

---

## Output & Feedback

### Fresh Installation Success (Skills)

```
══════════════════════════════════════════════════
✅ Skills installed successfully!
══════════════════════════════════════════════════

📁 Location: .agents/skills/

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

📁 Location: .agents/agents/

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

📁 Location: .agents/skills/

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

📁 Location: .agents/agents/

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
   - Select one or more installation paths
   - Configure .gitignore (fresh install only)
   - Select skills once
   - Clone and checkout the selected skills into each selected path
3. **Subagents flow** (if selected):
   - Fetch available subagents
   - Select one or more installation paths
   - Configure .gitignore (fresh install only)
   - Select subagents once
   - Clone and checkout Markdown agents, or convert selected agents to Codex TOML for Codex targets, in each selected path

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
- `~/.agents/skills/` (Copilot/Codex global)
- `~/.claude/skills/` (Claude global)
- `.agents/skills/` (Copilot/Codex local)
- `.claude/skills/` (Claude local)
- `.github/skills/` (legacy Copilot local)
- `~/.copilot/skills/` (legacy Copilot global)
- `~/.codex/skills/` (legacy Codex global)

**Subagents** - Scans these common paths:
- `~/.agents/agents/` (Copilot global sparse checkout)
- `~/.claude/agents/` (Claude global sparse checkout)
- `~/.codex/agents/` (Codex global generated TOML)
- `.agents/agents/` (Copilot local sparse checkout)
- `.claude/agents/` (Claude local sparse checkout)
- `.codex/agents/` (Codex local generated TOML)
- `.github/agents/` (legacy Copilot local sparse checkout)
- `~/.copilot/agents/` (legacy Copilot global sparse checkout)

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Git not installed | Error message with instructions |
| Network failure | Error with details, graceful exit |
| No skills found | Error message |
| User cancels (Ctrl+C) | "Installation cancelled" message |
| No skills selected | Inline error, prevents confirmation |
