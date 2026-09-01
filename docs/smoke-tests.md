# Smoke Tests — Sandbox, Redis, and LangGraph Server

This document is the implementation reference for the three standalone smoke tests added to verify that the agent's supporting infrastructure is actually working. Each test is a single Bun script that connects to the real backend, performs a minimal end-to-end check, and exits non-zero on failure.

## 1. Why these tests exist

The agent pipeline depends on three external systems that can silently break:

- **Daytona** — provisions and executes inside isolated sandboxes.
- **Redis / BullMQ** — the message queues that carry commands and results between `agent-brain` and `sandbox-worker`.
- **LangGraph server** — the HTTP front end that exposes the `coding` graph.

These tests answer three questions directly:

| Question | Test |
|---|---|
| Can we create a sandbox and run code in it? | `test-sandbox.ts` |
| Is Redis up and can BullMQ write/read jobs? | `test-redis.ts` |
| Is the LangGraph server up with the `coding` graph registered? | `test-server.ts` |

They follow the same pattern as the existing `packages/db/scripts/test-db.ts` connectivity check: a single `main()` that logs a clear pass/fail line and calls `process.exit(0)` or `process.exit(1)`.

## 2. Test inventory

| Package / App | Script | File | What it verifies |
|---|---|---|---|
| `packages/contracts` | `test:redis` | `scripts/test-redis.ts` | Redis reachability + BullMQ enqueue/read round-trip |
| `apps/sandbox-worker` | `test:sandbox` | `scripts/test-sandbox.ts` | Daytona sandbox create + command execution |
| `apps/agent-brain` | `test:server` | `scripts/test-server.ts` | LangGraph server `/ok`, `/info`, and `coding` assistant |

Each script was added as a `test:*` entry in its package's `package.json` `scripts` block.

## 3. Redis / BullMQ test

File: `packages/contracts/scripts/test-redis.ts`

Run:

```powershell
bun run test:redis --filter=@repo/contracts
# or
cd packages/contracts; bun run test:redis
```

Behavior:

1. Connects to Redis using `REDIS_HOST` / `REDIS_PORT` (default `localhost:6379`).
2. Calls `queue.waitUntilReady()` with a 10-second fail-fast deadline so a missing Redis reports an error instead of hanging.
3. Reads `queue.redisVersion` to confirm the connection is live.
4. Enqueues a smoke job and reads it back with `queue.getJob(...)` to prove BullMQ write/read works.
5. Removes the job and obliterates the throwaway test queue to avoid polluting the real queues.

The test queue is `agent-to-sandbox-test`, distinct from the production `agent-to-sandbox` and `sandbox-to-agent` queues.

## 4. Sandbox (Daytona) test

File: `apps/sandbox-worker/scripts/test-sandbox.ts`

Run:

```powershell
bun run test:sandbox --filter=sandbox-worker
```

Requires `DAYTONA_API_KEY` to be set.

Behavior:

1. Builds a `Daytona` client from the environment.
2. Creates a sandbox named `nixx-smoke-<timestamp>` using the same `DEFAULT_SANDBOX_CREATE_PARAMS` (snapshot `daytona-small`, user `daytona`) that production uses.
3. Runs `echo nixx-ok` inside the sandbox and asserts the output is `nixx-ok`, proving the sandbox is both created and usable.
4. Deletes the test sandbox in a `finally` block so a failed assertion still cleans up.

## 5. LangGraph server test

File: `apps/agent-brain/scripts/test-server.ts`

Run (the server must already be running):

```powershell
bun run test:server --filter=agent-brain
```

Targets `AGENT_BRAIN_URL` (default `http://localhost:4000`).

Behavior:

1. GETs `/ok` and asserts the response body is `{ ok: true }`.
2. GETs `/info` and logs the reported feature flags.
3. POSTs to `/assistants/search` with `{ graph_id: "coding" }` and asserts an assistant with that `graph_id` exists.

## 6. Environment variables

| Variable | Default | Used by |
|---|---|---|
| `REDIS_HOST` | `localhost` | Redis test |
| `REDIS_PORT` | `6379` | Redis test |
| `DAYTONA_API_KEY` | (required) | Sandbox test |
| `DAYTONA_API_URL` | `https://app.daytona.io/api` | Sandbox test (via SDK) |
| `AGENT_BRAIN_URL` | `http://localhost:4000` | Server test |

The Redis and sandbox scripts import `dotenv/config`, so `.env` in the package directory is loaded automatically.

## 7. Verification

All three scripts typecheck cleanly with `tsc` (exit 0). The Redis test was exercised against an environment without a running Redis instance and correctly failed fast with:

```
❌ Redis/BullMQ connection test failed: Could not reach Redis at localhost:6379 within 10000ms — is it running?
```

The sandbox and server tests require their respective backends (Daytona API, LangGraph server) to be running to exercise the real paths.
