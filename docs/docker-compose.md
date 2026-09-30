# Docker Compose deployment

Nixx runs four Compose services:

| Service | Container port | Host port | Purpose |
| --- | ---: | ---: | --- |
| `web` | 3000 | 3000 | Next.js UI and API routes |
| `agent-brain` | 4000 | 4000 | LangGraph coding graph |
| `sandbox-worker` | none | none | BullMQ worker for Daytona operations |
| `redis` | 6379 | 6379 | BullMQ queue broker |

The worker has no HTTP server. It consumes jobs from Redis and sends results back to Agent Brain.

## Start

Run these commands from the repository root:

```powershell
docker compose up --build -d
docker compose logs -f web agent-brain sandbox-worker
```

Open `http://localhost:3000`. Stop the stack with:

```powershell
docker compose down
```

Redis data is persisted in the `redis-data` Docker volume. `docker compose down -v` also deletes that queue data.

## Build notes

- The web image installs dependencies with Bun but runs `next build` with the Node binary. Next.js 16's production build crashes under Bun with `Expected CommonJS module to have a function wrapper`, so the build must run on Node.
- Bun places workspace dependencies in each app's own `node_modules` (for example `apps/web/node_modules/next`, `apps/agent-brain/node_modules/.bin/langgraphjs`), not the repository root. Container start commands must use those workspace paths.
- The Agent Brain image copies the pruned source (`out/full`) as well as installed dependencies, because the LangGraph CLI needs `langgraph.json` and `src/graph.ts` at runtime.

## Required configuration

Compose loads these files:

- `apps/web/.env`
  - `DATABASE_URL`
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL=http://localhost:3000`
  - `GITHUB_CLIENT_ID`
  - `GITHUB_CLIENT_SECRET`
  - `GITHUB_APP_ID`
  - `GITHUB_PRIVATE_KEY`
- `apps/agent-brain/.env`
  - `DATABASE_URL`
  - `OPENAI_API_KEY`
- `apps/sandbox-worker/.env`
  - `DAYTONA_API_KEY`
  - optional `DAYTONA_API_URL`
  - optional `DAYTONA_TARGET`

The Compose file supplies the service-network values automatically:

- Agent Brain and sandbox worker use `REDIS_HOST=redis` and `REDIS_PORT=6379`.
- Web uses `AGENT_BRAIN_URL=http://agent-brain:4000`.

Do not use `localhost` for these values inside containers. `localhost` refers to the current container, not another Compose service.

## GitHub callback and URLs

For local Compose, set the GitHub OAuth application callback URL to:

```text
http://localhost:3000/api/auth/callback/github
```

Keep `BETTER_AUTH_URL` aligned with the public browser URL. If the app is deployed behind a domain or reverse proxy, update both values to that HTTPS origin and configure the proxy to forward requests to port 3000.

## CORS

The normal browser flow does not need CORS because the browser talks to the web service on port 3000, and the Next.js server talks privately to Agent Brain over the Compose network. Do not expose Agent Brain to the browser directly unless that architecture changes.

If Agent Brain is later called directly from a different browser origin, configure CORS at the reverse proxy or LangGraph server for the exact frontend origin, for example `https://app.example.com`; do not use `*` with authenticated requests.

## Secrets and safety

Use new values for any credentials that have appeared in committed files, terminal output, or chat history. Rotate the database password, GitHub OAuth secret, GitHub App private key, OpenAI API key, and Better Auth secret as applicable. Keep `.env` files out of Git and provide them separately on the deployment host.

The GitHub private key must remain a valid PEM value. If it is stored as one environment line, encode line breaks as `\\n` only if the application converts them back to newlines; otherwise use the multiline format already supported by the existing app configuration.

## Troubleshooting

```powershell
docker compose ps
docker compose logs agent-brain
docker compose logs sandbox-worker
docker compose exec redis redis-cli ping
```

If the worker exits immediately, verify `DAYTONA_API_KEY`. If Agent Brain cannot connect to Redis, verify that its container environment shows `REDIS_HOST=redis`, not `localhost`. If the web app cannot reach the graph, verify `AGENT_BRAIN_URL=http://agent-brain:4000`.
