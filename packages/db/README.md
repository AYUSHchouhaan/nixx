# `@repo/db`

`@repo/db` owns Nixx's PostgreSQL connection, Drizzle schema, and database scripts. The web app uses it for authentication and application data; Agent Brain uses PostgreSQL separately for LangGraph checkpoints.

## Responsibilities

- Create the Drizzle database client.
- Define Better Auth tables and Nixx thread storage.
- Export the canonical schema for queries and migrations.
- Provide migration, push, generation, and inspection commands.

## Structure

- `src/index.ts` — database client exports.
- `src/schema.ts` — users, accounts, sessions, verifications, and threads.
- `drizzle.config.ts` — Drizzle Kit configuration.
- `scripts/test-db.ts` — database connectivity check.
- `drizzle/` — generated local migration output.

## Environment

Set `DATABASE_URL` in the environment used by the command. Do not commit credentials or local `.env` files.

## Commands

Run from the repository root:

```bash
bun run db:generate --filter=@repo/db
bun run db:migrate --filter=@repo/db
bun run db:push --filter=@repo/db
bun run db:studio --filter=@repo/db
bun run --filter @repo/db db:test
bun run --filter @repo/db check-types
```

Schema changes belong in `src/schema.ts`; generate migrations locally after updating the schema.
