---
name: worker-lifecycle
description: Use when hiring or firing agents/workers. Provides the exact workflow for least-privilege provisioning, system prompt composition, and safe layoff handling.
---

# Worker Lifecycle Skill

Use this skill only when you need to hire or fire workers.

## Hire workflow
1. Define role and responsibilities.
2. Prepare job posting text.
3. Ensure least-privilege tool list (minimum required tools only).
4. Execute `hire_worker` with:
   - `worker_name`
   - `role`
   - `job_posting` or `job_posting_path`
   - `allowed_tools`
   - optional `wake_interval_minutes`
5. Store returned `profile_id` and bearer token securely.

## Layoff workflow
1. Confirm worker is not in protected roles:
   - Legal Advisor
   - Security Advisor
   - Accountant / Buchhalter
2. Execute `layoff_worker` with `worker_id`.
3. Verify profile revocation succeeded.
4. Reassign open/blocked tickets from fired role.

## Ticket/Artifact protocol reminder
- Workers communicate via tickets and artifacts only.
- Expected ticket statuses:
  `new -> ready -> claimed -> in_progress -> waiting_review -> done`
  with side paths to `blocked` and `canceled`.
- Outputs must be added as artifact ids in `artifact_links`.
