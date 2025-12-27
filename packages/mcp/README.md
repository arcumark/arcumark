# @arcumark/mcp

MCP (Model Context Protocol) server for Arcumark.

## Installation

```bash
bun install
bun run build
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "arcumark": {
      "command": "bun",
      "args": ["/path/to/arcumark/packages/mcp/src/index.ts"]
    }
  }
}
```

Or with the built version:

```json
{
  "mcpServers": {
    "arcumark": {
      "command": "node",
      "args": ["/path/to/arcumark/packages/mcp/dist/index.js"]
    }
  }
}
```

## Available Tools

### Project Management

- `create_project` - Create a new project
- `list_projects` - List all projects
- `get_project` - Get project details
- `delete_project` - Delete a project
- `validate_timeline` - Validate project timeline

## Storage

Projects are stored in `~/.arcumark/projects` by default (file-based storage).
