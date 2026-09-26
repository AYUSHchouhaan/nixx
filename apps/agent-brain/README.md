# Agent Brain

The `agent-brain` app hosts Nixx's LangGraph server. It creates the programmer graph, configures PostgreSQL checkpointing, consumes sandbox results from Redis/BullMQ, and exposes the `coding` graph to the web app.

## Responsibilities

- Start the LangGraph development/server process.
- Create the programmer graph from `@repo/agent`.
- Persist graph checkpoints with `PostgresSaver`.
- Send sandbox commands through `BullMqSandboxClient`.
- Resolve command results through the sandbox result consumer.

## Structure

- `src/graph.ts` — graph export and PostgreSQL checkpointer setup.
- `src/bullmq-sandbox-client.ts` — queue-backed `SandboxClient` implementation.
- `src/result-consumer.ts` — resolves pending sandbox calls.
- `src/pending-calls.ts` — in-memory command correlation.
- `langgraph.json` — LangGraph server configuration.
- `scripts/` — service checks and development utilities.

## Development

From the repository root:

```bash
bun run --filter agent-brain langgraph:dev
```

The LangGraph server runs on `http://localhost:4000`.

## Commands

```bash
bun run --filter agent-brain dev
bun run --filter agent-brain langgraph:dev
bun run --filter agent-brain check-types
bun run --filter agent-brain test:server
```

## Environment

Set these values in `apps/agent-brain/.env`:

- `DATABASE_URL` — PostgreSQL connection string for LangGraph checkpoints.
- `OPENAI_API_KEY` — model provider credential.
- `REDIS_HOST` — Redis hostname.
- `REDIS_PORT` — Redis port.

Redis and PostgreSQL must be available before starting the service.
