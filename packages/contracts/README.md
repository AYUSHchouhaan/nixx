# `@repo/contracts`

`@repo/contracts` defines the shared messages and queue clients used between Agent Brain and the Sandbox Worker. It is the transport boundary for provisioning, repository operations, shell commands, and previews.

## Responsibilities

- Define sandbox command names and message shapes.
- Create BullMQ queues for agent-to-sandbox and sandbox-to-agent traffic.
- Provide shared Redis connection configuration.
- Define the `SandboxClient` interface used by the agent package.

## Structure

- `src/messages.ts` — provisioning, command, and result message types.
- `src/queue.ts` — BullMQ queue instances.
- `src/config.ts` — queue names and Redis connection settings.
- `src/sandbox-client.ts` — sandbox abstraction consumed by the agent.
- `src/index.ts` — public exports.
- `scripts/test-redis.ts` — Redis connectivity check.

## Queue flow

```text
Agent Brain
  -> agent-to-sandbox
  -> Sandbox Worker
  -> sandbox-to-agent
  -> Agent Brain
```

Each request carries a `commandId` so the caller can correlate the worker response.

## Commands

```bash
bun run --filter @repo/contracts check-types
bun run --filter @repo/contracts test:redis
```

Keep contract changes synchronized across the agent tool, worker dispatcher, and result consumer.
