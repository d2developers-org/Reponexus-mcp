# AGCP MCP Server — Client Setup & Configuration Guide

This guide details how to connect the **AGCP MCP Server** (`reponexus-mcp`) to MCP-compatible AI clients such as **Claude Desktop**, **Cursor**, and **Antigravity**.

---

## 1. Overview of Capabilities

The AGCP MCP server runs locally via standard input/output (**stdio**) and provides 4 deterministic tools:

| Tool | Purpose |
| :--- | :--- |
| `get_context` | Deterministic minimal code context retrieval using the SAGE engine (sub-30ms, 0 tokens) |
| `validate_patch` | Dry-run verification of a unified diff without touching the filesystem |
| `apply_patch` | Applies patch with automated timestamped backup and `tsc` verification with auto-rollback |
| `rollback_patch` | Restores files from the most recent or specified `.agcp/backups/` snapshot |

---

## 2. Prerequisites

- **Node.js**: v18+ (v20+ recommended)
- **Dependencies Installed**:
  ```sh
  npm install
  ```
- **Code Graph Built**:
  ```sh
  npm run build-graph
  ```

---

## 3. Client Configuration

### A. Claude Desktop

Add the following to your `claude_desktop_config.json`:

- **Windows Path**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS Path**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agcp": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "C:/Users/sudarsan kumar/OneDrive/Desktop/Projects of d²devs/Reponexusmcp/src/mcp/index.ts"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

*Note: Replace the path above with your absolute repository path if moved.*

---

### B. Cursor IDE

In Cursor:
1. Open **Settings** -> **Features** -> **MCP**.
2. Click **+ Add New MCP Server**.
3. Configure:
   - **Name**: `agcp`
   - **Type**: `command`
   - **Command**: `npx -y tsx src/mcp/index.ts`
   - **Working Directory**: Path to your `Reponexusmcp` root.

---

### C. Antigravity / Gemini CLI / Standalone Inspector

To inspect and test interactively using the official Model Context Protocol Inspector:

```sh
npx @modelcontextprotocol/inspector npx tsx src/mcp/index.ts
```

---

## 4. End-to-End Workflow Example

### Step 1: Retrieval
The user asks:
> *"Where is the token validation logic in our auth system?"*

The host AI calls:
```json
{
  "name": "get_context",
  "arguments": {
    "query": "token validation auth"
  }
}
```
**Response**: SAGE extracts the exact function lines, class references, and imports.

### Step 2: Safe Patch Application
The host AI designs a bug fix as a unified diff:
```json
{
  "name": "apply_patch",
  "arguments": {
    "patch": "--- a/src/graph/types.ts\n+++ b/src/graph/types.ts\n..."
  }
}
```
**Safety Guarantee**:
1. Patch syntax & context lines verified.
2. Snapshot saved to `.agcp/backups/<timestamp>/`.
3. Patch written to disk atomically.
4. `tsc --noEmit` verifies project still compiles. If errors occur, changes are reverted automatically.

