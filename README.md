# Easy MCP Gateway
A simple to use dynamic Tool MCP Gateway.

## Setup
Set `ADMIN_API_TOKEN` in your environment (or `.env`) before starting the server.

## Features
- Tools can be deactivated/activated granularly per profile
- Token will be counted
- Audit Logs
- Analytics
- Configurable Human in the Loop for selected Tools
- Bearer Authentication
- Markdown Vault files per profile at `data/vaults/<profileId>/`
  - `MEMORY.md` is appended when `store_memory` succeeds
  - `daily/YYYY-MM-DD.md` is system-generated from tool executions

## Admin API Security
- All `/api/*` admin endpoints now require `Authorization: Bearer <ADMIN_API_TOKEN>`.
- Admin CORS is no longer open; browser access is intended to be same-origin only.

## Multi-Agent Workspace Isolation
- Filesystem tools (`read_file`, `write_file`, `edit_file`, `apply_patch`, `ls`, `grep`, `find`) are scoped per profile.
- `exec` and `process` run with profile-specific working directories.
- Default workspace root is `./workspaces/<profileId>`.
- Optional override: `AGENT_WORKSPACES_ROOT`.
