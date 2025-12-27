# @arcumark/cli

Command-line interface for Arcumark.

## Installation

```bash
bun install
bun run build
bun link
```

## Commands

### Project Management

```bash
# Create a new project
arcumark project create -n "My Project" -p 1080p_h30

# List all projects
arcumark project list

# Delete a project
arcumark project delete <project-id>
```

## Configuration

Configuration file: `~/.arcumark/config.json`

Default configuration:
- Storage: File-based in `~/.arcumark/projects`
- Preset: 1080p 30fps

## Storage Options

- **File-based**: Projects stored as JSON files
- **SQLite**: Projects stored in SQLite database

Configure in `~/.arcumark/config.json`:

```json
{
  "storage": {
    "type": "file",
    "basePath": "~/.arcumark/projects"
  }
}
```
