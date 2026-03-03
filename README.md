# Easy MCP Gateway
A simple to use dynamic Tool MCP Gateway.

## Features
- Tools can be deactivated/activated granularly per profile
- Token will be counted
- Audit Logs
- Analytics
- Configurable Human in the Loop for selected Tools
- Bearer Authentication
- Ticket system for asynchronous multi-agent work
- Artifact bucket store for worker outputs (including binary files like PNG)
- Scheduler tick and managed schedules (cron-like)
- Worker hire/fire with least-privilege tool sets and dedicated bearer profiles
- Agent runtime wake loop for active workers
- Automatic CEO onboarding bootstrap at startup (ticket + core doc placeholders)
- Supervisor prompt-machine context endpoint/tool
- Auto-bootstrap of mandatory workers: Accountant, Security Advisor, Legal Advisor
- API bearer authentication on `/api/*` endpoints with privileged-route checks
- Enforced ticket state-machine and ownership guards
- Worker run-engine with process execution, timeout and persisted run status
- Review domain (`reviews.db`) with explicit reviewer decision/confidence records
- Policy engine (`policy.db`) with idempotency-keyed allow/deny decisions for external actions
- Leader lock for scheduler/runtime ticks in multi-instance scenarios
- Health/readiness/metrics endpoints for ops observability

## Building Blocks

### 1) Artifact Bucket Store
- binary/text payloads under `artifacts/<bucket>/<artifact_id>/...`
- metadata index in `artifacts.db`
- tools: `artifact_store`, `artifact_get`, `artifact_list`

### 2) Scheduler + Managed Schedules
- schedule CRUD: `schedule_create`, `schedule_list`, `schedule_update`, `schedule_delete`
- maintenance + due schedule execution: `scheduler_tick`

### 3) Workforce + Runtime Isolation
- workers are represented as separate MCP profiles (own bearer tokens)
- least-privilege tool grants via `createProfileWithTools`
- tools: `hire_worker`, `layoff_worker`, `worker_list`, `agent_runtime_tick`
- runtime protocol embedded into worker system prompts:
  - communication via tickets/artifacts only
  - known ticket statuses and expected transitions

### Operational safety additions
- `/api/*` now requires Bearer authentication
- privileged actions (profile management, hire/fire, HITL decisions, tool toggles) require privileged profiles
- ticket transitions are validated in `TicketService` against allowed state changes
- only claimed worker can move tickets into active states (`in_progress`, `waiting_review`, `blocked`) unless privileged

### Runtime & governance additions
- worker execution runs persisted in `worker-runs.db`
- review records persisted in `reviews.db` (decision + confidence)
- policy decisions persisted in `policy.db` with idempotency key
- tick leader locks persisted in `locks.db`
- admin ops endpoints:
  - `GET /api/runs`
  - `GET /api/reviews`
  - `GET /api/health/live`
  - `GET /api/health/ready`
  - `GET /api/metrics`

### 4) Supervisor Prompt Machine
- tool: `supervisor_context`
- api: `GET /api/supervisor/context`
- includes:
  - supervisor system prompt
  - runtime/ticket protocol
  - latest tickets
  - latest artifacts
  - workforce summary
  - core files (`principles.md`, `goals.md`, `strategy.md`, `mission.md`)

### 5) CEO Onboarding Bootstrap
On startup:
- ensures placeholders if missing: `principles.md`, `goals.md`, `strategy.md`, `mission.md`
- creates onboarding ticket for role `CEO` with provided onboarding prompt/system prompt
- stores state in `onboarding-state.json`

Onboarding API:
- `GET /api/onboarding/status`
- `POST /api/onboarding/complete`

## Skill for Hiring/Layoff
A dedicated skill guide is available at:
- `skills/worker-lifecycle/SKILL.md`

Use this only when worker lifecycle actions are needed.

## Runtime Environment Variables
- `SCHEDULER_ENABLED` (default: `true`)
- `SCHEDULER_INTERVAL_MS` (default: `60000`)
- `AGENT_RUNTIME_ENABLED` (default: `true`)
- `AGENT_RUNTIME_INTERVAL_MS` (default: `60000`)


## CodexSDK ChatGPT Sign-In + Manual Operations Start

The dashboard now uses the **Codex CLI/SDK device auth flow** (ChatGPT sign-in):

- `Sign in with ChatGPT` triggers `codex login --device-auth`.
- You are sent to `https://auth.openai.com/codex/device` and enter the one-time code.
- `Start Operations` appears only while the system is not running; once started, it is hidden.
- Scheduler/runtime loops only execute when the system is started.

### Auth environment variables

- `CODEX_SDK_HOME` (optional; default: `<repo>/.codex`) location where Codex CLI stores login/session credentials.
- `SYSTEM_AUTO_START` (default: `false`, set `true` to skip dashboard start button in unattended mode)

> Note: Custom OAuth client-id/redirect/token URL env vars (`CODEX_OAUTH_*`) are no longer required for dashboard sign-in.
