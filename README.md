# Nixx

Nixx is an AI-powered coding workspace built as a Turborepo monorepo. It combines a Next.js web application, GitHub authentication and repository integration, a LangGraph coding agent, Redis/BullMQ messaging, and Daytona sandboxes for isolated code execution.

## Features

- GitHub OAuth authentication with Better Auth
- Browse GitHub repositories and branches available to the authenticated user
- Create and manage coding threads
- Stream agent responses and tool events to the web application
- Run coding tools inside isolated Daytona sandboxes
- Clone repositories into reusable sandboxes
- Persist thread state with LangGraph Postgres checkpoints
- Share contracts and infrastructure across services through workspace packages

## Architecture

```text
┌──────────────┐       HTTP/SSE        ┌────────────────┐
│  Next.js Web │ ────────────────────▶ │  Agent Brain   │
│   :3000      │                        │  LangGraph     │
└──────┬───────┘                        └───────┬────────┘
       │                                         │
       │ PostgreSQL                              │ Redis / BullMQ
       ▼                                         ▼
┌──────────────┐                        ┌────────────────┐
│ Drizzle DB   │                        │ Sandbox Worker │
│ Better Auth  │                        │ Daytona SDK    │
└──────────────┘                        └───────┬────────┘
                                                │
                                                ▼
                                       ┌────────────────┐
                                       │ Daytona Sandbox│
                                       │ Repository     │
                                       └────────────────┘
```

The web app starts agent runs and consumes streamed events. The agent service runs the LangGraph coding graph and checkpoints state in PostgreSQL. Agent tools send sandbox work through Redis/BullMQ, and the sandbox worker executes those operations through Daytona.

## Tech Stack

- **Monorepo:** Turborepo
- **Runtime and package manager:** Bun
- **Frontend:** Next.js 16, React 19, TypeScript
- **Authentication:** Better Auth with GitHub OAuth
- **Database:** PostgreSQL, Drizzle ORM
- **Agent runtime:** LangGraph, LangChain, OpenAI
- **Messaging:** Redis and BullMQ
- **Sandbox execution:** Daytona
- **Shared UI:** `@repo/ui`

## Repository Structure

```text
nixx/
├── apps/
│   ├── web/                 # Next.js frontend and API routes
│   ├── agent-brain/         # LangGraph server and agent orchestration
│   └── sandbox-worker/      # BullMQ worker for Daytona sandbox operations
├── packages/
│   ├── agent/               # Coding graph and agent tools
│   ├── contracts/           # Shared queue messages and service contracts
│   ├── db/                  # Drizzle client, schema, and database scripts
│   ├── ui/                  # Shared React components
│   ├── eslint-config/       # Shared ESLint configuration
│   └── typescript-config/   # Shared TypeScript configurations
├── package.json
├── turbo.json
└── bun.lock
```

## Requirements

Install the following before starting the project:

- [Bun](https://bun.sh/) 1.3.12 or newer
- Node.js 18 or newer
- PostgreSQL database
- Redis server
- GitHub OAuth App
- GitHub App with repository permissions
- Daytona account and API key
- OpenAI API key

## Getting Started

### 1. Install dependencies

Run this from the repository root:

```powershell
bun install
```

### 2. Configure environment variables

Keep environment files local and never commit secrets. The project uses a separate `.env` file for each service.

#### `apps/web/.env`

```env
DATABASE_URL=postgresql://user:password@host:5432/database
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
BETTER_AUTH_URL=http://localhost:3000

# GitHub OAuth App
GITHUB_CLIENT_ID=your-oauth-client-id
GITHUB_CLIENT_SECRET=your-oauth-client-secret

# GitHub App
GITHUB_APP_ID=your-github-app-id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# LangGraph server
AGENT_BRAIN_URL=http://localhost:4000
```

#### `apps/agent-brain/.env`

```env
DATABASE_URL=postgresql://user:password@host:5432/database
OPENAI_API_KEY=your-openai-api-key

REDIS_HOST=localhost
REDIS_PORT=6379
```

#### `apps/sandbox-worker/.env`

Start with `apps/sandbox-worker/.env.example` and set:

```env
DAYTONA_API_KEY=your-daytona-api-key
DAYTONA_API_URL=https://app.daytona.io/api
DAYTONA_TARGET=

REDIS_HOST=localhost
REDIS_PORT=6379
```

The private key must remain on one line with escaped `\n` characters between PEM lines. Do not commit any `.env` file or private key.

### 3. Prepare the database

Apply the Drizzle schema from the repository root:

```powershell
bun run db:migrate --filter=@repo/db
```

The LangGraph service also creates its Postgres checkpoint tables when it starts.

### 4. Configure GitHub

Create a GitHub OAuth App with:

- **Homepage URL:** `http://localhost:3000`
- **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`

Create a GitHub App separately for repository access. Give it the repository permissions required by the coding workflow, generate a private key, and install it on the account or organization containing the target repositories.

The installation ID is resolved dynamically for the authenticated user through GitHub's `/user/installations` endpoint; it is not hardcoded in the environment.

### 5. Start the services

Run each service in its own terminal from the repository root.

#### Web application

```powershell
bun run --filter web dev
```

Open [http://localhost:3000](http://localhost:3000).

#### Agent brain

```powershell
bun run --filter agent-brain langgraph:dev
```

The LangGraph server runs at [http://localhost:4000](http://localhost:4000) and exposes the `coding` graph defined in `apps/agent-brain/langgraph.json`.

#### Sandbox worker

```powershell
bun run --filter sandbox-worker dev
```

The worker listens to BullMQ jobs and executes repository operations through Daytona.

Redis must be running before starting the agent brain and sandbox worker.

## Common Commands

Run these commands from the repository root:

| Command                                        | Description                                                 |
| ---------------------------------------------- | ----------------------------------------------------------- |
| `bun install`                                  | Install all workspace dependencies                          |
| `bun run dev`                                  | Start all configured development services through Turborepo |
| `bun run build`                                | Build all packages and applications                         |
| `bun run lint`                                 | Lint all packages and applications                          |
| `bun run check-types`                          | Run TypeScript checks across the workspace                  |
| `bun run format`                               | Format TypeScript and Markdown files                        |
| `bun run db:generate --filter=@repo/db`        | Generate a Drizzle migration                                |
| `bun run db:migrate --filter=@repo/db`         | Apply database migrations                                   |
| `bun run db:push --filter=@repo/db`            | Push the schema directly to the database                    |
| `bun run db:studio --filter=@repo/db`          | Open Drizzle Studio                                         |
| `bun run --filter agent-brain test:server`     | Test the LangGraph server                                   |
| `bun run --filter sandbox-worker test:sandbox` | Test Daytona sandbox connectivity                           |
| `bun run --filter @repo/contracts test:redis`  | Test Redis connectivity                                     |

## Application Flow

1. A visitor signs in through GitHub OAuth on `/login`.
2. Better Auth creates or loads the user session and stores OAuth account data in PostgreSQL.
3. The web app loads the user's accessible repositories and branches through GitHub.
4. A coding thread is created for the selected repository and branch.
5. The web app starts an agent run and streams events from the agent service.
6. The LangGraph agent sends tool requests to the sandbox queue through BullMQ.
7. The sandbox worker provisions or reuses a Daytona sandbox, clones the repository, and executes the requested operation.
8. Results return through BullMQ to the agent, then stream back to the web app.
9. LangGraph checkpoints the graph state in PostgreSQL using the thread ID.

## Important Files

| File                                                  | Purpose                                             |
| ----------------------------------------------------- | --------------------------------------------------- |
| `apps/web/app/page.tsx`                               | Main application entry page                         |
| `apps/web/app/login/`                                 | GitHub login interface                              |
| `apps/web/app/lib/auth.ts`                            | Better Auth configuration                           |
| `apps/web/app/lib/github-installation.ts`             | GitHub App installation and token helpers           |
| `apps/web/app/api/threads/`                           | Thread creation and thread APIs                     |
| `apps/web/app/api/threads/[threadId]/run/route.ts`    | Starts an agent run                                 |
| `apps/web/app/api/threads/[threadId]/stream/route.ts` | Streams agent events to the frontend                |
| `apps/agent-brain/src/graph.ts`                       | LangGraph entry point and Postgres checkpoint setup |
| `apps/agent-brain/langgraph.json`                     | LangGraph server configuration                      |
| `apps/sandbox-worker/src/main.ts`                     | BullMQ worker entry point                           |
| `apps/sandbox-worker/src/provision.ts`                | Daytona sandbox provisioning and repository cloning |
| `packages/agent/`                                     | Coding graph and tool definitions                   |
| `packages/contracts/`                                 | Shared Redis/BullMQ message contracts               |
| `packages/db/src/schema.ts`                           | Canonical database schema                           |

## Database

The canonical schema is defined in `packages/db/src/schema.ts` and includes the Better Auth tables:

- `users`
- `sessions`
- `accounts`
- `verifications`

Thread and application data are stored in the same PostgreSQL-backed system. LangGraph uses Postgres checkpoints so a thread can resume from its latest graph state.

Generated Drizzle migration folders are ignored by Git. Keep schema changes in source control and generate migrations locally when needed.

## Security Notes

- Never commit `.env` files, API keys, OAuth secrets, or private keys.
- Use separate GitHub OAuth and GitHub App credentials.
- GitHub installation tokens are short-lived and scoped to the installed repositories.
- Daytona sandboxes provide the isolated execution environment for repository tools.
- Use a strong random value for `BETTER_AUTH_SECRET` in deployments.
- Replace all localhost URLs and development credentials before deploying.

## Status

Nixx is under active development. The repository contains the core web application, agent orchestration, queue-based sandbox execution, GitHub integration, and persistence layers.
