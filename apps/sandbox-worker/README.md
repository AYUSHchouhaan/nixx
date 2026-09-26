# Sandbox Worker

The `sandbox-worker` app executes repository operations inside Daytona sandboxes. It consumes BullMQ jobs from Agent Brain, provisions or reuses a sandbox, clones the selected repository, and sends command results back through Redis.

## Responsibilities

- Consume the `agent-to-sandbox` queue.
- Create or reuse named Daytona sandboxes.
- Clone repositories into `/home/daytona/<sandbox-id>`.
- Configure Git authentication and commit identity.
- Execute file, search, shell, Git, and preview operations.
- Start or stop agent-requested preview servers in persistent Daytona sessions.
- Return structured results to the `sandbox-to-agent` queue.

## Structure

- `src/main.ts` — BullMQ worker entrypoint.
- `src/provision.ts` — sandbox lookup, creation, repository cloning, and Git setup.
- `src/daytona.ts` — Daytona client and sandbox defaults.
- `src/executor.ts` — command dispatcher.
- `src/preview.ts` — persistent preview sessions and signed preview URLs.
- `src/run-command.ts` — finite shell command execution.
- `src/read.ts`, `src/search.ts`, `src/create-file.ts`, `src/edit-file.ts`, `src/git.ts` — sandbox operations.

## Development

From the repository root:

```bash
bun run --filter sandbox-worker dev
```

The worker has no HTTP server; it listens for BullMQ jobs.

## Commands

```bash
bun run --filter sandbox-worker dev
bun run --filter sandbox-worker start
bun run --filter sandbox-worker check-types
bun run --filter sandbox-worker test:sandbox
```

## Environment

Set these values in `apps/sandbox-worker/.env`:

- `DAYTONA_API_KEY`
- `DAYTONA_API_URL`
- `DAYTONA_TARGET` (optional)
- `REDIS_HOST`
- `REDIS_PORT`

The configured Daytona snapshot must contain the runtimes and tools required by repositories executed in the sandbox.
