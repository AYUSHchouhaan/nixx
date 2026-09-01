# Nixx Project Flow — Complete Runtime and Architecture Guide

This document explains how the Nixx project works from startup through a complete coding-agent run. It is based on the current source code in this repository. Where an older README describes behavior that no longer matches the implementation, this document calls out the current behavior explicitly.

---

## 1. What Nixx is

Nixx is a GitHub-connected coding agent. The intended user experience is:

1. Sign in with GitHub.
2. Select a repository and branch.
3. Describe a coding task.
4. Nixx sends the task to an agent brain.
5. The agent inspects and modifies a clone of the repository inside a Daytona sandbox.
6. The agent creates a GitHub branch and pull request early, then commits and pushes the completed changes to that pull request.
7. The browser receives live agent messages, tool calls, and tool results through Server-Sent Events (SSE).

The central safety boundary is that the agent does not operate on the local Nixx checkout. Agent tools send work through Redis/BullMQ to the sandbox worker, and the sandbox worker performs file and shell operations inside Daytona.

At a high level:

```text
Browser
  |
  | Next.js pages and fetch/SSE requests
  v
apps/web
  |
  | session checks, database reads, GitHub installation token
  | LangGraph SDK request
  v
apps/agent-brain :4000
  |
  | LangGraph graph + OpenAI model
  | BullMQ command messages
  v
Redis
  |
  v
apps/sandbox-worker
  |
  | Daytona SDK
  v
Daytona sandbox
  |
  | clone, inspect, edit, test, git commit/push
  v
GitHub repository and pull request
```

Postgres is used by both the web application and the agent brain:

- The web application stores users, sessions, OAuth accounts, threads, and threads.
- LangGraph uses Postgres checkpointing for graph state associated with a `thread_id`.

---

## 2. Repository structure

```text
nixx/
├── apps/
│   ├── web/
│   │   └── Next.js application, pages, API routes, auth, GitHub integration
│   ├── agent-brain/
│   │   └── LangGraph HTTP server and BullMQ bridge
│   └── sandbox-worker/
│       └── BullMQ worker that executes commands in Daytona
├── packages/
│   ├── agent/
│   │   └── Reusable LangGraph programmer graph and agent tools
│   ├── contracts/
│   │   └── Queue names, message types, sandbox interfaces
│   ├── db/
│   │   └── Drizzle database client and canonical schema
│   ├── ui/
│   │   └── Shared UI package
│   ├── eslint-config/
│   │   └── Shared lint configuration
│   └── typescript-config/
│       └── Shared TypeScript configuration
├── docs/
├── package.json
├── turbo.json
└── bun.lock
```

### Responsibility by package

| Area | Location | Responsibility |
|---|---|---|
| User-facing website and backend | `apps/web` | Next.js pages, API routes, auth, database access, GitHub API calls, agent request proxying |
| Agent server | `apps/agent-brain` | Starts LangGraph Server, initializes checkpointing, consumes sandbox results, creates the graph |
| Agent implementation | `packages/agent` | Graph nodes, model invocation, tool selection, GitHub PR workflow, sandbox client calls |
| Sandbox execution | `apps/sandbox-worker` | Consumes sandbox commands and provisions/uses Daytona sandboxes |
| Shared transport contracts | `packages/contracts` | TypeScript contracts and Redis/BullMQ queue instances |
| Database | `packages/db` | PostgreSQL connection, Drizzle client, schema exports |

---

## 3. What happens when the project starts

The root command is defined in `package.json`:

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "check-types": "turbo run check-types"
  }
}
```

`bun run dev` runs `turbo run dev`. Turborepo finds every workspace with a `dev` script and starts them according to the workspace graph.

The complete system has three runtime processes that should be treated separately:

```powershell
bun run dev --filter=sandbox-worker
bun run dev --filter=agent-brain
bun run dev --filter=web
```

A Redis server must be available before the agent brain and sandbox worker can communicate. Postgres must be available for the web database and LangGraph checkpoint tables. Daytona credentials must be available to the sandbox worker. OpenAI credentials must be available to the agent brain.

### 3.1 Web startup

`apps/web/package.json` runs:

```powershell
next dev --port 3000
```

The web app starts a Next.js 16 development server with Turbopack on:

```text
http://localhost:3000
```

Next.js loads the App Router files under `apps/web/app`. Server components and route handlers can access environment variables, the database, cookies, and Better Auth.

The database client is imported from `@repo/db`. In `packages/db/src/index.ts`, Drizzle creates a PostgreSQL pool using `process.env.DATABASE_URL`.

### 3.2 Agent-brain startup

`apps/agent-brain/package.json` runs:

```powershell
langgraphjs dev --config langgraph.json --port 4000
```

`langgraph.json` registers one graph:

```json
{
  "graphs": {
    "coding": "./src/graph.ts:graph"
  },
  "env": ".env"
}
```

The graph is exposed with assistant/graph id:

```text
coding
```

The server module `apps/agent-brain/src/graph.ts` executes during startup:

1. Loads `.env` with `dotenv/config`.
2. Reads `DATABASE_URL`.
3. Throws if `DATABASE_URL` is missing.
4. Starts `startResultConsumer()`.
5. Creates a `PostgresSaver` from `DATABASE_URL`.
6. Calls `await checkpointer.setup()`.
7. Creates the programmer graph with a `BullMqSandboxClient` and the Postgres checkpointer.
8. Exports the graph for LangGraph Server.

The important point is that the result consumer starts inside the same agent-brain process that serves LangGraph requests. It listens for sandbox results before any tool call is made.

### 3.3 Sandbox-worker startup

`apps/sandbox-worker/package.json` runs:

```powershell
bun run src/main.ts
```

Startup behavior in `apps/sandbox-worker/src/main.ts`:

1. Loads `.env`.
2. Checks `DAYTONA_API_KEY`.
3. Exits immediately if the Daytona key is missing.
4. Starts a BullMQ worker for the `agent-to-sandbox` queue.
5. Waits for provision and command jobs.

The worker does not start a local HTTP server. It is a background queue consumer.

### 3.4 What does not happen automatically

Starting the web app alone does not mean agent execution is available. The web server can render pages, but a run also needs:

- Redis.
- The agent-brain process on port 4000 or the URL in `AGENT_BRAIN_URL`.
- The sandbox-worker process.
- A reachable PostgreSQL database.
- GitHub OAuth credentials.
- GitHub App credentials and an installed GitHub App.
- `OPENAI_API_KEY` for the model.
- `DAYTONA_API_KEY` for sandbox provisioning.

---

## 4. Environment variables

### Web environment: `apps/web/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection used by Drizzle and Better Auth |
| `BETTER_AUTH_SECRET` | Better Auth signing/encryption secret |
| `BETTER_AUTH_URL` | Canonical auth application URL, normally `http://localhost:3000` |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client id |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |
| `GITHUB_APP_ID` | GitHub App id used to select the user's installation |
| `GITHUB_PRIVATE_KEY` | GitHub App private key; escaped `\n` characters are converted to newlines |
| `AGENT_BRAIN_URL` | Agent server URL; defaults to `http://localhost:4000` |

### Agent-brain environment: `apps/agent-brain/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL URL for LangGraph checkpointing |
| `OPENAI_API_KEY` | OpenAI authentication for `ChatOpenAI` |
| `OPENAI_MODEL` | Model name; defaults to `gpt-5-mini` |
| `REDIS_HOST` | Redis host; defaults to `localhost` |
| `REDIS_PORT` | Redis port; defaults to `6379` |

### Sandbox-worker environment: `apps/sandbox-worker/.env`

| Variable | Purpose |
|---|---|
| `DAYTONA_API_KEY` | Daytona SDK authentication; required at startup |
| `REDIS_HOST` | Redis host; defaults to `localhost` |
| `REDIS_PORT` | Redis port; defaults to `6379` |

---

## 5. Database model and persistence

The canonical schema is `packages/db/src/schema.ts`.

### 5.1 `users`

Better Auth users are stored in `users`.

| Column | Purpose |
|---|---|
| `id` | Primary user id generated/managed by Better Auth |
| `name` | Display name |
| `email` | Unique email |
| `email_verified` | Verification flag |
| `image` | Avatar URL |
| `created_at` | Creation time |
| `updated_at` | Update time |

### 5.2 `accounts`

OAuth provider accounts are stored in `accounts`.

For GitHub, this includes:

- The Better Auth account id.
- The provider id, normally `github`.
- The linked `user_id`.
- The GitHub OAuth `access_token`.
- Optional refresh/id tokens and expiry fields.
- OAuth scope.

The GitHub OAuth access token is persisted in the database by Better Auth. The current auth hooks also copy the access token and resolved GitHub App installation id into HttpOnly cookies for later API calls.

### 5.3 `sessions`

Better Auth sessions are stored in `sessions`. The browser carries the session token in a cookie. Every protected server route asks Better Auth to resolve the session from the incoming request headers/cookies.

### 5.4 `verifications`

Better Auth uses `verifications` for verification-style flows. The current primary login flow is GitHub OAuth.

### 5.5 `threads`

A thread is the high-level saved container created when a user starts a task from `/app`.

| Column | Purpose |
|---|---|
| `id` | Text primary key, generated with `randomUUID()` by `POST /api/threads` |
| `user_id` | Owner of the thread |
| `title` | Optional title, currently derived from the first 60 characters of the prompt |
| `created_at` | Creation timestamp |
| `updated_at` | Update timestamp |

### 5.6 `threads`

A thread is the execution/chat identity used by LangGraph and the browser.

| Column | Purpose |
|---|---|
| `id` | Text primary key, generated with `randomUUID()` by `POST /api/threads` |
| `thread_id` | Parent thread foreign key |
| `user_id` | Owner; used for authorization checks |
| `sandbox_id` | Optional persistent sandbox identifier; currently the runtime falls back to the thread id |
| `metadata` | JSON object holding repo URL, branch, and title |
| `created_at` | Creation timestamp |
| `updated_at` | Update timestamp |

### 5.7 LangGraph checkpoints

The agent brain creates `PostgresSaver` using the same `DATABASE_URL` and passes it to `createProgrammerGraph`. LangGraph uses the `thread_id` from `config.configurable.thread_id` to associate graph state with a thread.

This is separate from the application `threads` row, but the same id is intentionally passed to both systems. The web database owns the thread record; LangGraph owns the checkpoint state for the graph run.

### 5.8 What is not persisted in the main application schema

The current application schema does not have dedicated columns for:

- Pull request number.
- Pull request URL.
- GitHub branch name created by the agent.
- Run status.
- Final agent summary.
- Sandbox path.
- Individual tool calls.

The pull request number and URL are held in LangGraph state during the run. The visible thread messages are recovered from LangGraph state through `getThreadMessages`.

---

## 6. Full browser flow

### 6.1 Visiting `/`

`apps/web/app/page.tsx` is a server component.

It calls:

```ts
await auth.api.getSession({ headers: await headers() })
```

It then renders the public landing page. If a session exists, it displays the signed-in user's name. If not, it shows links to `/login`.

No thread, thread, sandbox, or agent run is created by visiting `/`.

### 6.2 Visiting `/login`

`apps/web/app/login/page.tsx` renders the login UI and includes `LoginForm`.

The form implementation is under `apps/web/app/login/login-form.tsx`. Its expected behavior is to initiate Better Auth's GitHub social sign-in flow.

The Better Auth catch-all route is:

```text
/api/auth/[...all]
```

That route exposes Better Auth's generated GET and POST handlers through `toNextJsHandler(auth)`.

### 6.3 GitHub OAuth login

The configured provider is in `apps/web/app/lib/auth.ts`:

```ts
socialProviders: {
  github: {
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    mapProfileToUser: ...
  }
}
```

The general flow is:

1. The browser starts GitHub sign-in through Better Auth.
2. Better Auth redirects to GitHub.
3. GitHub authenticates the person and redirects back to Better Auth's callback route.
4. Better Auth exchanges the OAuth authorization result for a GitHub access token.
5. Better Auth creates or updates the `users` row.
6. Better Auth creates or updates the `accounts` row with the GitHub access token.
7. Better Auth creates the application session row and sets the session cookie.
8. The account database hooks run for both account creation and account update.
9. The hook resolves the user's GitHub App installation by calling GitHub's authenticated-installations API.
10. The hook stores the GitHub OAuth access token and installation id in HttpOnly cookies.

The profile mapping uses the GitHub display name, login fallback, email fallback, and avatar URL.

### 6.4 Visiting `/app`

`apps/web/app/app/page.tsx` is protected.

1. It reads the Better Auth session.
2. If there is no session, it redirects to `/login`.
3. It loads the current user's threads ordered by `updatedAt` descending.
4. It loads the current user's threads ordered by `updatedAt` descending.
5. It maps thread metadata into repository URL, branch, and title values.
6. It renders `AppShell` with the initial thread and thread lists.

The page itself does not create a thread or thread.

### 6.5 Loading repositories

After `AppShell` mounts, a client-side effect requests:

```text
GET /api/github/repositories
```

The endpoint:

1. Checks the Better Auth session.
2. Reads the GitHub App installation id from the HttpOnly cookie.
3. Creates a short-lived GitHub App installation token.
4. Calls GitHub's `listReposAccessibleToInstallation` through Octokit pagination.
5. Returns `{ repositories }`.

The browser stores the repository list in React state.

### 6.6 Loading branches

When a repository is selected, `AppShell` requests:

```text
GET /api/github/branches?owner=OWNER&repo=REPOSITORY
```

The endpoint:

1. Checks the session.
2. Validates `owner` and `repo` query parameters.
3. Reads the installation id cookie.
4. Creates a short-lived installation token.
5. Calls GitHub's `repos.listBranches` through Octokit pagination.
6. Returns `{ branches }`.

The client selects the repository's default branch when it appears in the response, otherwise it selects the first branch.

### 6.7 Starting a task from `/app`

When the user submits a prompt, `AppShell.handleSubmit` performs two database API calls in sequence.

#### Request 1: create a thread

```text
POST /api/threads
Content-Type: application/json

{
  "title": "first 60 characters of prompt"
}
```

The server creates a new random UUID and inserts a `threads` row tied to the authenticated session user.

Response:

```json
{
  "id": "thread-uuid"
}
```

#### Request 2: create a thread

```text
POST /api/threads
Content-Type: application/json

{
  "repoUrl": "https://github.com/owner/repository.git",
  "branch": "main",
  "title": "first 60 characters of prompt"
}
```

The server creates another random UUID and inserts a `threads` row.

The thread stores:

- `threadId` as a foreign key.
- The authenticated `userId`.
- A null `sandboxId` unless one was explicitly sent.
- `repoUrl`, `branch`, and `title` inside JSON metadata.

Response:

```json
{
  "id": "thread-uuid"
}
```

#### Browser navigation

The browser stores the initial prompt in a one-time session-storage handoff keyed by the new thread id, then navigates to:

```text
/app/thread-uuid
```

At this point:

- A thread id exists.
- A thread id exists.
- A sandbox has not necessarily been created yet.
- A GitHub branch and pull request have not necessarily been created yet.
- The first agent run has not yet started.

### 6.8 Visiting `/app/[id]`

`apps/web/app/app/[id]/page.tsx`:

1. Checks the session.
2. Reads the route id.
3. Loads the thread from the database.
4. Verifies that `thread.userId` equals the session user's id.
5. Calls `getThreadMessages(threadId)` against LangGraph state.
6. Resolves repository and branch from query parameters first, then thread metadata.
7. Renders `ChatClient`.

If the thread does not exist or belongs to another user, the page returns `notFound()`.

`ChatClient` initializes the LangGraph SDK `useStream` hook with:

- `assistantId: "coding"`.
- `threadId` equal to the database thread id.
- Existing messages as initial values.
- A transport pointing to `/api/threads/{threadId}/stream`.

No agent run is started merely by opening the page. The run starts when the user submits the prompt.

---

## 7. Endpoint-by-endpoint reference

## 7.1 Better Auth catch-all

### `GET|POST /api/auth/[...all]`

File:

```text
apps/web/app/api/auth/[...all]/route.ts
```

Implementation:

```ts
export const { GET, POST } = toNextJsHandler(auth);
```

Purpose:

- Handles Better Auth sign-in and callback operations.
- Creates/updates users and accounts.
- Creates and validates sessions.
- Sets and reads auth cookies.

This route is generated by Better Auth rather than manually implementing each auth endpoint.

---

## 7.2 Threads

### `GET /api/threads`

File:

```text
apps/web/app/api/threads/route.ts
```

Behavior:

1. Requires a Better Auth session.
2. Selects threads where `threads.userId` equals the current user.
3. Orders threads by `updatedAt` descending.
4. Selects threads whose `threadId` belongs to one of those threads.
5. Orders threads by `updatedAt` descending.
6. Returns both arrays.

Response shape:

```json
{
  "threads": [
    {
      "id": "...",
      "userId": "...",
      "title": "...",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "threads": [
    {
      "id": "...",
      "userId": "...",
      "sandboxId": null,
      "metadata": {
        "repoUrl": "...",
        "branch": "...",
        "title": "..."
      }
    }
  ]
}
```

### `POST /api/threads`

Request body:

```json
{
  "title": "optional title"
}
```

Behavior:

1. Requires a session.
2. Parses the optional JSON body.
3. Creates a UUID using `randomUUID()`.
4. Inserts a row with the current user's id.
5. Returns the new id.

Response:

```json
{
  "id": "thread-uuid"
}
```

Errors:

- `401` if no session exists.

---

## 7.3 Threads

### `POST /api/threads`

File:

```text
apps/web/app/api/threads/route.ts
```

Request body:

```json
{
  "sandboxId": "optional",
  "repoUrl": "optional repository URL",
  "branch": "optional branch",
  "title": "optional title"
}
```

Behavior:

1. Requires a session.
2. Requires `threadId`.
3. Creates a random UUID for the thread.
4. Inserts the thread with the current session user id.
5. Stores repository URL, branch, and title in `metadata`.
6. Returns the thread id.

Response:

```json
{
  "id": "thread-uuid"
}
```

Important current behavior:

- The endpoint does not verify that the supplied thread belongs to the current user before inserting.
- The endpoint does not automatically set `sandboxId`.
- The runtime later uses `thread.sandboxId ?? threadId` as the sandbox id.

### `GET /api/threads/:threadId`

File:

```text
apps/web/app/api/threads/[threadId]/route.ts
```

Behavior:

1. Requires a session.
2. Loads the thread by id.
3. Verifies that the thread belongs to the current user.
4. Reads LangGraph messages using `getThreadMessages(threadId)`.
5. Returns thread metadata and messages.

Response shape:

```json
{
  "thread": {
    "id": "thread-uuid",
    "sandboxId": null,
    "metadata": {
      "repoUrl": "...",
      "branch": "...",
      "title": "..."
    },
    "createdAt": "...",
    "updatedAt": "..."
  },
  "messages": []
}
```

Errors:

- `401` if unauthenticated.
- `404` if the thread does not exist or belongs to another user.

---

## 7.4 Non-streaming run

### `POST /api/threads/:threadId/run`

File:

```text
apps/web/app/api/threads/[threadId]/run/route.ts
```

Request body:

```json
{
  "query": "Implement a feature",
  "notes": "optional notes",
  "repoUrl": "https://github.com/owner/repo.git",
  "branch": "main"
}
```

Behavior:

1. Requires a session.
2. Requires `query`.
3. Requires `repoUrl`.
4. Loads the thread.
5. Verifies thread ownership.
6. Chooses `sandboxId = thread.sandboxId ?? threadId`.
7. Reads the user's GitHub App installation id from the HttpOnly cookie.
8. Creates a short-lived GitHub installation token.
9. Calls `runAgent()` in `apps/web/app/lib/agent-brain.ts`.
10. `runAgent()` creates a LangGraph run and waits for it with `client.runs.join()`.
11. Returns the final graph summary.

Response:

```json
{
  "summary": "..."
}
```

Errors:

- `401` unauthenticated.
- `400` missing query or repository URL.
- `404` missing or unauthorized thread.
- `401` missing GitHub installation id.
- `500` agent, GitHub, queue, sandbox, or graph failure.

This is a blocking JSON path. The active browser UI uses the streaming endpoint instead.

---

## 7.5 Streaming run

### `POST /api/threads/:threadId/stream`

File:

```text
apps/web/app/api/threads/[threadId]/stream/route.ts
```

The route is explicitly configured for Node.js and dynamic responses:

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
```

Accepted input forms include the LangGraph SDK shape:

```json
{
  "input": {
    "query": "Implement a feature",
    "notes": "",
    "repoUrl": "https://github.com/owner/repo.git",
    "branch": "main",
    "multitask_strategy": "interrupt"
  }
}
```

The route also accepts equivalent top-level fields:

```json
{
  "query": "Implement a feature",
  "notes": "",
  "repoUrl": "https://github.com/owner/repo.git",
  "branch": "main",
  "multitask_strategy": "interrupt"
}
```

It additionally reads `config.configurable` so repository and branch values can be supplied there.

Repository resolution precedence is:

1. `config.configurable.repo_url` if it is a non-empty string.
2. `input.repoUrl`.
3. Top-level `repoUrl`.
4. The thread metadata repository URL.

Branch resolution follows the same order:

1. `config.configurable.branch`.
2. `input.branch`.
3. Top-level `branch`.
4. Thread metadata branch.

Behavior:

1. Requires a session.
2. Parses the request.
3. Requires a query.
4. Loads and authorizes the thread.
5. Resolves repository and branch.
6. Chooses `sandboxId = thread.sandboxId ?? threadId`.
7. Resolves the GitHub App installation id from the cookie.
8. Creates a short-lived installation token.
9. Calls `streamAgent()`.
10. `streamAgent()` calls the LangGraph SDK `client.runs.stream()` against assistant `coding` and the same `threadId`.
11. The route converts every LangGraph chunk into SSE:

```text
 event: <chunk.event>
 data: <JSON chunk.data>

```

Response headers:

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

If iteration fails, the route sends an SSE `error` event containing:

```json
{
  "error": "stream_failed",
  "message": "..."
}
```

The browser's `useStream` hook interprets message events, tool calls, tool results, and loading state.

---

## 7.6 GitHub installation token

### `GET /api/github/installation-token`

File:

```text
apps/web/app/api/github/installation-token/route.ts
```

Behavior:

1. Requires a Better Auth session.
2. Reads the installation id cookie.
3. Uses `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` to create GitHub App authentication.
4. Requests a short-lived installation access token.
5. Returns the installation id, token, and expiration time.

Response:

```json
{
  "installationId": 123456,
  "token": "ghs_...",
  "expiresAt": "..."
}
```

The web UI does not need to call this endpoint directly during its normal repository-loading flow; the repositories and branches endpoints perform the same token creation internally.

---

## 7.7 GitHub repositories

### `GET /api/github/repositories`

Behavior:

1. Requires a session.
2. Gets the stored installation id.
3. Creates an installation token.
4. Calls `apps.listReposAccessibleToInstallation` through Octokit pagination.
5. Returns all accessible repositories.

Response:

```json
{
  "repositories": [
    {
      "full_name": "owner/repository",
      "owner": { "login": "owner" },
      "name": "repository",
      "clone_url": "https://github.com/owner/repository.git",
      "default_branch": "main"
    }
  ]
}
```

---

## 7.8 GitHub branches

### `GET /api/github/branches?owner=OWNER&repo=REPOSITORY`

Behavior:

1. Requires a session.
2. Requires both `owner` and `repo` query parameters.
3. Gets the installation id.
4. Creates an installation token.
5. Calls `repos.listBranches` through Octokit pagination.
6. Returns the branches.

Response:

```json
{
  "branches": [
    { "name": "main" },
    { "name": "develop" }
  ]
}
```

---

## 7.9 Users endpoint

### `GET /api/users`

The route file exists at:

```text
apps/web/app/api/users/route.ts
```

The current file is empty. It does not export a request handler, so there is no implemented users API behavior at present.

---

## 8. GitHub credential and token flow

Nixx uses two GitHub mechanisms for different jobs.

### 8.1 OAuth App token

The OAuth token comes from the GitHub OAuth login. It is used during login-time installation discovery:

```text
GET /user/installations
```

The helper is:

```text
apps/web/app/lib/github-installation.ts:getInstallationId
```

It creates an Octokit client authenticated with the user's OAuth token, lists installations available to that authenticated user, and selects the installation whose `app_id` matches `GITHUB_APP_ID`.

### 8.2 GitHub App installation token

After the installation id is known, Nixx uses the GitHub App private key to create a GitHub App JWT and then exchanges that authentication for a short-lived installation access token.

The helper is:

```text
createInstallationToken(installationId)
```

That short-lived installation token is used for:

- Listing accessible repositories.
- Listing branches.
- Creating a branch.
- Creating a pull request.
- Git clone authentication inside Daytona.
- Git pushes from the sandbox.

This separation is important: the user OAuth token discovers the user's installation; the installation token performs installation-scoped repository operations.

### 8.3 Cookies

`apps/web/app/lib/auth.ts` defines:

```text
GITHUB_ACCESS_TOKEN_COOKIE
GITHUB_INSTALLATION_ID_COOKIE
```

Both are written as HttpOnly cookies with `sameSite: "lax"`, `path: "/"`, and `secure` enabled in production.

The regular Better Auth session cookie remains the authentication authority for protected routes. The GitHub cookies provide the GitHub integration context used by the current implementation.

---

## 9. Agent run flow in exact order

This is the most important flow in the project.

### Step 1: Browser sends the stream request

The `ChatClient` calls `stream.submit()` with:

```ts
{
  query,
  notes: "",
  repoUrl,
  branch,
  threadId,
  multitask_strategy: "interrupt"
}
```

The LangGraph SDK sends this to:

```text
POST /api/threads/{threadId}/stream
```

### Step 2: Web authorizes and prepares context

The Next.js route:

- Validates the Better Auth session.
- Loads the thread.
- Verifies the current user owns the thread.
- Resolves repository URL and branch.
- Gets the GitHub installation id.
- Mints a short-lived installation token.

The web server then creates the LangGraph stream with this configuration:

```ts
{
  configurable: {
    thread_id: threadId,
    sandbox_id: sandboxId,
    repo_url: repoUrl,
    branch,
    installation_token: installationToken
  }
}
```

The values are passed at invocation time, not as graph-constructor arguments.

### Step 3: LangGraph resumes or creates state

The LangGraph server finds assistant `coding` and invokes the graph from `apps/agent-brain/src/graph.ts`.

The Postgres checkpointer uses `configurable.thread_id`. If this is a new thread, the graph starts with default state. If it is an existing thread, LangGraph can use its checkpointed state and message history.

The state fields are:

```text
query       current task description
notes       optional task notes
messages    LangChain human, AI, and tool messages
summary     final generated summary
pullRequest pull request number and URL, or null
```

### Step 4: `prepare-sandbox` runs

The first graph node requires these configurable values:

- `thread_id`.
- `thread_id`.
- `sandbox_id`.
- `repo_url`.
- `installation_token`.
- Optional `branch`.

It calls:

```text
sandboxClient.provision(...)
```

The current sandbox client is `BullMqSandboxClient`.

### Step 5: Agent creates or reuses a Daytona sandbox

The sandbox worker receives a provision message. `provisionSandbox`:

1. Validates that the repository URL is HTTPS and has hostname `github.com`.
2. Creates a Daytona sandbox name:

```text
nixx-{sandboxId}
```

3. Attempts to get an existing Daytona sandbox by that name.
4. Creates one from the `daytona-small` snapshot if it does not exist.
5. Uses `/home/daytona/{sandboxId}` as the repository path.
6. Checks whether that repository directory already exists.
7. If it exists, returns `cloned: false` and reuses it.
8. Otherwise clones the repository using the installation token.
9. Configures Git's `http.extraheader` with the installation token.
10. Configures Git user name and email.
11. Disables commit signing for the sandbox repository.
12. Returns the sandbox result.

Daytona sandbox creation parameters include:

```text
user: daytona
snapshot: daytona-small
autoStopInterval: 15
autoDeleteInterval: 0
```

The current source therefore implements idempotent provisioning by sandbox name and repository-directory existence.

### Step 6: Provision response returns through Redis

The worker publishes a `provision_result` message to:

```text
sandbox-to-agent
```

The agent-brain result consumer receives it and resolves the pending promise associated with the `commandId`.

`prepare-sandbox` completes without adding state. The important side effect is that the sandbox is now ready.

### Step 7: `create-empty-pr` runs

The graph next creates the durable GitHub pull request workflow.

`createEmptyPrNode`:

1. Reads `thread_id`, `repo_url`, `installation_token`, and optional branch.
2. Parses the owner and repository from the URL.
3. Fetches repository information.
4. Uses the requested branch or repository default branch as the PR base.
5. Fetches the base branch reference and SHA.
6. Creates a new branch named:

```text
nixx/{threadId}
```

7. Creates a GitHub pull request from that branch into the base branch.
8. Stores the PR number and URL in graph state.
9. Sends sandbox Git commands to fetch and checkout the new branch.
10. Creates an empty commit:

```text
chore: nixx empty pull request
```

11. Pushes the empty branch to GitHub.

The PR title is:

```text
Nixx — {threadId}
```

The PR body is:

```text
Opened by Nixx to collect changes for this coding session.
```

This means a pull request is created before the model starts editing files. Later changes are pushed into that same PR.

### Step 8: `generate-action` asks the model what to do

The graph creates sandbox tools and binds them to `ChatOpenAI`.

The model defaults to:

```text
gpt-5-mini
```

The system prompt tells the model:

- It is implementing the task.
- It should use tools intentionally.
- It should explain briefly before each tool call.
- It must read relevant files before editing.
- It should run checks such as tests/build/status.
- It should call `mark_task_complete` only when the task is complete.

On the first pass, the graph sends:

1. A system message containing the task description.
2. A human message containing the query and notes.

On later passes, it sends the system prompt plus the recent message history, limited to the last 300 messages.

### Step 9: Graph routes based on the model response

After `generate-action`, the graph examines the latest AI message.

Routing rules:

```text
latest AI has mark_task_complete tool call -> open-pull-request
latest AI has another tool call          -> take-action
latest AI has no tool call               -> open-pull-request
```

The current graph selects the first tool call from the AI message for execution.

The `reasoning-thinking` node exists but is currently a no-op and is not selected by the active routing function.

### Step 10: `take-action` executes one agent tool

`take-action` maps the tool name to one of:

- `glob`.
- `grep`.
- `read`.
- `run`.
- `create_file`.
- `edit`.
- `mark_task_complete`.

For ordinary tools it calls the tool with the same LangGraph config. The tool creates a sandbox command request. The result becomes a `ToolMessage` tied to the AI tool call id.

The graph then loops back to `generate-action`.

### Step 11: Tools cross the queue boundary

Every sandbox-backed agent tool calls `sandboxCall`.

`sandboxCall` extracts:

- `thread_id`.
- `thread_id`.
- `sandbox_id`.

It creates a `SandboxCallInput` and passes it to `BullMqSandboxClient.call()`.

`BullMqSandboxClient.call()`:

1. Generates a new `commandId` using `randomUUID()`.
2. Creates a command message.
3. Registers a resolver in the in-memory pending map.
4. Adds the message to `agent-to-sandbox`.
5. Waits for a matching result.
6. Rejects after 120 seconds if no result arrives.

The message is shaped like:

```json
{
  "type": "command",
  "commandId": "command-uuid",
  "threadId": "thread-uuid",
  "sandboxId": "sandbox-id",
  "command": "read_file",
  "args": {}
}
```

### Step 12: Sandbox worker executes the command

The worker consumes `agent-to-sandbox`.

For a command message it:

1. Gets the Daytona sandbox by `nixx-{sandboxId}`.
2. Calculates `/home/daytona/{sandboxId}` as the repository root.
3. Calls `executeSandboxCommand`.
4. Publishes a result message to `sandbox-to-agent`.

The result shape is:

```json
{
  "type": "result",
  "commandId": "same-command-uuid",
  "threadId": "thread-uuid",
  "sandboxId": "sandbox-id",
  "output": "...",
  "exitCode": 0,
  "error": null
}
```

### Step 13: Agent resumes after the result

The agent-brain result consumer matches the result's `commandId` against its pending map.

It resolves the waiting `Promise` in `BullMqSandboxClient`, which allows the tool invocation and graph node to continue.

The tool result is inserted into LangGraph messages. The next model call sees the result and decides what to do next.

### Step 14: The model repeats until complete

A typical sequence is:

```text
glob -> identify files
grep -> locate relevant symbols
read -> inspect exact files
edit/create_file -> modify code
run -> run tests, typecheck, lint, or build
read/run -> verify results
mark_task_complete -> signal completion
```

The exact sequence is chosen by the model. There is no fixed number of tool calls.

### Step 15: `open-pull-request` commits and pushes changes

When the model finishes, the graph runs `open-pull-request`.

This node:

1. Uses branch `nixx/{threadId}`.
2. Verifies that a PR exists in graph state.
3. Fetches and checks out the branch inside the sandbox.
4. Runs `git add -A` while explicitly excluding:
   - `node_modules`.
   - `.git`.
   - `.next`.
   - `dist`.
   - `build`.
   - `.turbo`.
5. Creates a commit:

```text
feat: nixx changes for {threadId}
```

6. Pushes the branch to GitHub.

The PR that was opened earlier now contains the real changes.

### Step 16: `end-conclusion` summarizes the session

The graph takes recent messages, truncates them, and asks the model to write a concise completion summary.

It writes the result into:

```text
state.summary
```

Then the graph reaches `END`.

### Step 17: SSE reaches the browser

The agent-brain stream emits LangGraph events. The Next.js stream route forwards each event without interpreting its internal data:

```text
event: <event-name>
data: <serialized-data>
```

The `useStream` hook updates:

- Assistant messages.
- Tool calls.
- Tool results.
- Loading state.
- Errors.

`ChatClient` renders these items as:

- `You` messages.
- `Agent` messages.
- `Tool result` blocks.
- Tool call arguments and results.
- Running/done/error status.

---

## 10. Agent tools in detail

### `glob`

Agent schema:

```json
{
  "patterns": ["**/src/**/*.ts"]
}
```

Limits:

- At least 1 pattern.
- At most 7 patterns.

The Daytona executor searches files under the repository root and returns relative paths. Results are deduplicated.

### `grep`

Agent schema:

```json
{
  "query": "keyword|anotherKeyword"
}
```

The worker uses Daytona's file search operation and returns up to five matching file paths.

### `read`

Agent schema:

```json
{
  "filePaths": ["src/index.ts", "src/app.ts"]
}
```

Limits:

- At least 1 file.
- At most 6 files.

The worker reads up to ten paths defensively and returns each file under a labeled section. The agent schema limits normal calls to six.

### `run`

Agent schema:

```json
{
  "command": "bun test"
}
```

The command runs with the repository root as its working directory inside Daytona. Output and exit code are returned.

### `create_file`

Agent schema:

```json
{
  "filePath": "src/new-file.ts",
  "content": "..."
}
```

The worker refuses to overwrite an existing file and tells the agent to use `edit` instead. Parent directories are created with `mkdir -p` before upload.

### `edit`

Agent schema:

```json
{
  "filePath": "src/existing-file.ts",
  "edits": [
    {
      "oldStr": "exact old text",
      "newStr": "replacement text"
    }
  ]
}
```

The worker:

1. Downloads the file.
2. Requires each `oldStr` to exist.
3. Applies edits sequentially.
4. Reuploads the resulting file.
5. Handles CRLF/LF normalization when an exact line-ending match fails.

Only the first occurrence of each replacement string is changed.

### `mark_task_complete`

This tool has no sandbox side effect. It returns an acknowledgement to the model. The graph uses the presence of its tool call as the signal to leave the tool loop and finalize the PR.

The supplied summary is not directly copied into the final graph summary; `end-conclusion` separately asks the model to summarize the session.

---

## 11. ID lifecycle — does an id get created?

Yes. Several ids exist, and they have different owners and lifetimes.

### 11.1 User id

Created/managed by Better Auth when a user is created. Stored in `users.id`.

Used to:

- Own threads.
- Own threads.
- Authorize access to protected records.

### 11.2 Session id and session token

Created by Better Auth during login. Stored in `sessions`. The browser receives a session cookie.

Used on every protected request to identify the current user.

### 11.3 Thread id

Created by `POST /api/threads` using `randomUUID()`.

Stored in:

```text
threads.id
```

Passed into thread creation and then into agent/sandbox context.

### 11.4 Thread id

Created by `POST /api/threads` using `randomUUID()`.

Stored in:

```text
threads.id
```

This is the most important run identity. It is used as:

- The URL id in `/app/{threadId}`.
- The LangGraph `thread_id`.
- The default `sandbox_id` when the database thread has no explicit sandbox id.
- The branch suffix in `nixx/{threadId}`.
- The pull request title suffix.
- The pull request commit message suffix.
- The database authorization lookup key.

### 11.5 Sandbox id

The thread creation endpoint accepts an optional `sandboxId`, but the current frontend does not send one. Therefore normal frontend-created threads use:

```text
sandboxId = thread.sandboxId ?? threadId
```

So in the normal path:

```text
sandbox id = thread id
Daytona name = nixx-{thread id}
repository path = /home/daytona/{thread id}
```

### 11.6 Command id

Every sandbox provisioning or command request gets a new `randomUUID()` in `BullMqSandboxClient`.

It is used only as a correlation id between:

```text
agent-brain pending promise
agent-to-sandbox queue message
sandbox-to-agent result message
```

It is not the same as the thread id and is not stored in Postgres.

### 11.7 GitHub branch name

The graph creates:

```text
nixx/{threadId}
```

The branch is derived from the thread id, not generated separately.

### 11.8 Pull request number and URL

GitHub creates the PR number. The URL is returned by GitHub. The graph stores both in the `pullRequest` state field:

```ts
{
  number: number,
  htmlUrl: string
}
```

They are not currently written into the `threads` table.

### 11.9 LangGraph checkpoint identity

LangGraph uses:

```text
config.configurable.thread_id = database thread id
```

This lets subsequent runs use the same graph thread and message/checkpoint history.

### ID relationship diagram

```text
Better Auth user.id
        |
        +--> threads.user_id
        |       thread.id
        |             |
        |             +--> threads.thread_id
        |
        +--> threads.user_id
                thread.id
                  |
                  +--> LangGraph configurable.thread_id
                  +--> default sandboxId
                  +--> Daytona name nixx-{threadId}
                  +--> Daytona repo path /home/daytona/{threadId}
                  +--> Git branch nixx/{threadId}
                  +--> PR title/commit message suffix

Each sandbox request
        |
        +--> commandId UUID for queue correlation only
```

---

## 12. Redis and BullMQ flow

The shared queue configuration is in `packages/contracts/src/config.ts`.

```text
agent-to-sandbox
sandbox-to-agent
```

Redis defaults to:

```text
localhost:6379
```

### Agent to sandbox

Produced by:

```text
apps/agent-brain/src/bullmq-sandbox-client.ts
```

Consumed by:

```text
apps/sandbox-worker/src/main.ts
```

Message types:

- `provision`.
- `command`.

### Sandbox to agent

Produced by:

```text
apps/sandbox-worker/src/main.ts
```

Consumed by:

```text
apps/agent-brain/src/result-consumer.ts
```

Message types:

- `provision_result`.
- `result`.

### Timeout behavior

The agent waits at most 120,000 milliseconds for a sandbox provision or command result. On timeout, the pending promise is rejected and the graph receives an error path through the tool invocation.

### Important limitation

The pending resolver maps are in memory inside agent-brain. Redis carries the messages, but the waiting promise/correlation state is not persisted. If the agent-brain process restarts while a command is in flight, the original pending resolver is lost.

---

## 13. Daytona sandbox behavior

The sandbox provider is initialized lazily in `apps/sandbox-worker/src/daytona.ts`.

The first call to `daytonaClient()` creates a singleton Daytona SDK client. Later calls reuse it.

Sandbox lookup uses a deterministic name:

```text
nixx-{sandboxId}
```

The sandbox repository directory is:

```text
/home/daytona/{sandboxId}
```

Provisioning is idempotent at two levels:

1. Existing Daytona sandbox with the deterministic name is reused.
2. Existing repository directory inside that sandbox is reused instead of cloned again.

The sandbox auto-stop interval is 15, while auto-delete is set to 0. The actual lifecycle therefore depends on Daytona's interpretation of those settings and external sandbox management.

---

## 14. Git and pull request workflow

The project intentionally uses an empty PR workflow.

### Why the empty PR is created first

The graph opens the PR immediately after provisioning, before model edits. That gives the coding session a durable GitHub location from the start. The graph state retains the PR number and URL while the agent works.

### Branch

```text
nixx/{threadId}
```

### Initial empty commit

```text
chore: nixx empty pull request
```

### Final change commit

```text
feat: nixx changes for {threadId}
```

### Staging exclusions

The final `git add` explicitly excludes generated or non-source locations:

```text
node_modules
.git
.next
dist
build
.turbo
```

### Git authentication

During sandbox provisioning, Git is configured with an authorization header built from the installation token. The worker also passes the token into the initial clone call.

---

## 15. Authorization boundaries

Protected routes use Better Auth session resolution. Thread-specific routes also compare the stored thread owner with the current session user.

Protected thread operations include:

- `GET /api/threads/:threadId`.
- `POST /api/threads/:threadId/run`.
- `POST /api/threads/:threadId/stream`.
- The `/app` page.
- The `/app/:id` page.

GitHub endpoints require a session and an installation id cookie.

The sandbox worker itself trusts queue messages and does not perform application-user authorization. Authorization is expected to happen before the agent request is submitted by the web backend.

---

## 16. Failure cases and responses

### Missing session

Most web API routes return:

```json
{
  "error": "Unauthorized"
}
```

with status `401`.

The streaming route returns plain text `Unauthorized` with status `401`.

### Missing thread or wrong owner

Thread routes return `404` with:

```json
{
  "error": "Thread not found"
}
```

The page route calls `notFound()`.

### Missing query

Run endpoints return status `400` when no query is supplied.

### Missing repository URL

The run and stream paths require a repository URL. The stream path can recover it from thread metadata if it is not in the request.

### Missing installation id

GitHub-backed operations return status `401` with:

```json
{
  "error": "GitHub installation ID missing"
}
```

### Invalid sandbox repository URL

The sandbox provisioner only accepts HTTPS GitHub URLs. Other values produce:

```text
Only https://github.com repository URLs are allowed
```

### Sandbox timeout

After 120 seconds without a result, the agent rejects the pending operation with a timeout error.

### Git failure

Git helpers throw if the sandbox result has an error or a non-zero exit code. The graph run then fails and the stream sends an error event if the failure occurs during streaming.

### Worker startup failure

The sandbox worker exits if `DAYTONA_API_KEY` is missing.

The agent brain throws during startup if `DATABASE_URL` is missing.

---

## 17. Current implementation differences from older documentation

`docs/README.md` contains an earlier architecture snapshot. The current source has moved beyond several statements in that document.

Current source behavior is:

- SSE streaming is implemented at `/api/threads/:threadId/stream`.
- LangGraph Postgres checkpointing is initialized in `apps/agent-brain/src/graph.ts`.
- Daytona is used by the sandbox worker through `@daytonaio/sdk`.
- Sandbox provisioning clones GitHub repositories into Daytona.
- The agent creates an empty pull request before editing.
- The web run path passes a GitHub installation token into the agent.
- Agent tools execute through the sandbox worker rather than directly on the local filesystem.
- The web UI uses `useStream` and renders agent/tool activity.

The older document says some of these features are deferred because it describes an earlier version of the implementation.

---

## 18. Recommended startup sequence

From the repository root:

```powershell
bun install
```

Apply the database schema/migrations using the repository's current Drizzle setup:

```powershell
bun run db:migrate --filter=@repo/db
```

Start Redis separately, then use three terminals:

### Terminal 1 — sandbox worker

```powershell
bun run dev --filter=sandbox-worker
```

Expected responsibility:

```text
Consumes agent-to-sandbox jobs and runs them in Daytona.
```

### Terminal 2 — agent brain

```powershell
bun run dev --filter=agent-brain
```

Expected responsibility:

```text
Serves the coding LangGraph on http://localhost:4000.
```

### Terminal 3 — web

```powershell
bun run dev --filter=web
```

Open:

```text
http://localhost:3000
```

### Verify in this order

1. The web page loads.
2. GitHub login succeeds.
3. The app page loads repositories.
4. Selecting a repository loads branches.
5. Starting a task creates a thread row.
6. Starting a task creates a thread row.
7. The thread page opens.
8. The stream request reaches the web route.
9. The web route reaches agent-brain.
10. Agent-brain reaches `prepare-sandbox`.
11. Sandbox-worker provisions or reuses Daytona.
12. A GitHub branch and empty PR are created.
13. Agent tools execute through Redis and Daytona.
14. Final changes are committed and pushed.
15. The browser receives the final stream and summary.

---

## 19. File-by-file implementation map

### Web

| File | Role |
|---|---|
| `apps/web/app/page.tsx` | Public landing page and session-aware navigation |
| `apps/web/app/login/page.tsx` | Login page |
| `apps/web/app/login/login-form.tsx` | GitHub sign-in client UI |
| `apps/web/app/app/page.tsx` | Protected app home and initial thread/thread loading |
| `apps/web/app/app/app-shell.tsx` | Repository/branch selection, task creation, recent thread UI |
| `apps/web/app/app/[id]/page.tsx` | Protected thread page and LangGraph message loading |
| `apps/web/app/app/[id]/chat-client.tsx` | SSE stream client and chat/tool rendering |
| `apps/web/app/lib/auth.ts` | Better Auth configuration, credentials cookies, GitHub provider |
| `apps/web/app/lib/github-installation.ts` | Installation lookup, installation token creation, repository/branch fetches |
| `apps/web/app/lib/agent-brain.ts` | LangGraph SDK client, run and stream helpers |
| `apps/web/app/api/auth/[...all]/route.ts` | Better Auth HTTP handler |
| `apps/web/app/api/threads/route.ts` | Thread list/create API |
| `apps/web/app/api/threads/route.ts` | Thread create API |
| `apps/web/app/api/threads/[threadId]/route.ts` | Thread detail and message API |
| `apps/web/app/api/threads/[threadId]/run/route.ts` | Blocking JSON agent run API |
| `apps/web/app/api/threads/[threadId]/stream/route.ts` | Streaming agent run API |
| `apps/web/app/api/github/repositories/route.ts` | Accessible repository API |
| `apps/web/app/api/github/branches/route.ts` | Repository branch API |
| `apps/web/app/api/github/installation-token/route.ts` | Installation token API |
| `apps/web/app/api/users/route.ts` | Currently empty |

### Agent brain

| File | Role |
|---|---|
| `apps/agent-brain/langgraph.json` | Registers `coding` graph |
| `apps/agent-brain/src/graph.ts` | Initializes checkpointing/result consumer and exports graph |
| `apps/agent-brain/src/bullmq-sandbox-client.ts` | Sends provision/command jobs and waits for results |
| `apps/agent-brain/src/pending-calls.ts` | In-memory command correlation maps |
| `apps/agent-brain/src/result-consumer.ts` | Consumes sandbox results and resolves pending calls |

### Sandbox worker

| File | Role |
|---|---|
| `apps/sandbox-worker/src/main.ts` | BullMQ worker entry point |
| `apps/sandbox-worker/src/provision.ts` | Daytona lookup/create, GitHub clone, Git setup |
| `apps/sandbox-worker/src/daytona.ts` | Daytona client singleton and sandbox constants |
| `apps/sandbox-worker/src/executor.ts` | Maps abstract commands to Daytona filesystem/process operations |

### Agent package

| File | Role |
|---|---|
| `packages/agent/programmer/graph.ts` | Graph nodes and routing |
| `packages/agent/programmer/types.ts` | Graph state and dependency types |
| `packages/agent/programmer/model.ts` | OpenAI chat model factory |
| `packages/agent/programmer/nodes/prepare-sandbox.ts` | Provision sandbox node |
| `packages/agent/programmer/nodes/create-empty-pr.ts` | Create branch/PR and empty commit |
| `packages/agent/programmer/nodes/generate-action.ts` | Ask model for next action |
| `packages/agent/programmer/nodes/take-action.ts` | Execute selected model tool call |
| `packages/agent/programmer/nodes/open-pull-request.ts` | Stage, commit, and push final work |
| `packages/agent/programmer/nodes/end-conclusion.ts` | Generate final summary |
| `packages/agent/programmer/nodes/reasoning-thinking.ts` | Current no-op placeholder |
| `packages/agent/programmer/tools/index.ts` | Composes agent tools |
| `packages/agent/programmer/tools/read.ts` | Read tool |
| `packages/agent/programmer/tools/glob.ts` | Glob tool |
| `packages/agent/programmer/tools/grep.ts` | Grep tool |
| `packages/agent/programmer/tools/bash.ts` | Shell/run tool |
| `packages/agent/programmer/tools/create-file.ts` | New file tool |
| `packages/agent/programmer/tools/edit.ts` | Existing file edit tool |
| `packages/agent/programmer/tools/mark-task-complete.ts` | Completion signal tool |
| `packages/agent/programmer/lib/github.ts` | GitHub branch and pull request API helpers |
| `packages/agent/programmer/lib/sandbox-git.ts` | Git commands routed through sandbox client |
| `packages/agent/programmer/lib/config.ts` | Reads configurable ids and invokes sandbox client |

### Shared packages

| File | Role |
|---|---|
| `packages/contracts/src/messages.ts` | Sandbox command/provision/result message types |
| `packages/contracts/src/config.ts` | Redis connection and queue names |
| `packages/contracts/src/queue.ts` | BullMQ queue instances |
| `packages/contracts/src/sandbox-client.ts` | Sandbox client interface |
| `packages/db/src/index.ts` | Drizzle PostgreSQL client |
| `packages/db/src/schema.ts` | Canonical application schema |

---

## 20. One complete example

Assume the prompt is:

```text
Add rate limiting to the threads API
```

The actual identity chain can look like:

```text
userId:         user-123
threadId:       8f2...c90
sandboxId:      8f2...c90
Daytona name:   nixx-8f2...c90
repo path:      /home/daytona/8f2...c90
branch:         nixx/8f2...c90
pull request:   #42
commandId:      new UUID for every queue operation
```

The timeline is:

```text
POST /api/threads
  -> inserts thread 2f0...a11

POST /api/threads
  -> inserts thread 8f2...c90

POST /api/threads/8f2...c90/stream
  -> verifies user and thread
  -> creates installation token
  -> starts LangGraph coding run

prepare-sandbox
  -> queue provision message
  -> Daytona sandbox nixx-8f2...c90
  -> clone repository into /home/daytona/8f2...c90

create-empty-pr
  -> create branch nixx/8f2...c90
  -> create PR #42
  -> checkout branch in sandbox
  -> push empty commit

generate-action
  -> model calls glob

glob
  -> commandId A
  -> Redis queue
  -> Daytona finds relevant files
  -> result returns

model
  -> calls read
  -> calls edit
  -> calls run with tests
  -> calls mark_task_complete

open-pull-request
  -> git add excluded generated folders
  -> commit feat: nixx changes for 8f2...c90
  -> push nixx/8f2...c90

end-conclusion
  -> model summarizes work

SSE
  -> browser renders messages, tools, results, and completion
```

---

## 21. Final mental model

The simplest accurate description is:

```text
The browser creates a database thread and thread.
The thread id becomes the identity of the agent run.
The web backend authenticates the user and mints a GitHub installation token.
LangGraph uses the same thread id for checkpointed state.
The graph provisions a Daytona sandbox and opens an empty PR.
The model chooses read/search/edit/run tools.
Each tool call travels from agent-brain to Redis to sandbox-worker to Daytona.
The result travels back through Redis and resumes the waiting graph.
When the model finishes, Nixx commits and pushes the sandbox changes to the existing PR.
The web stream forwards agent events to the browser through SSE.
```

That is the full current project flow.
