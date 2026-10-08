# Nixx API reference

The web application exposes a small JSON API under `/api` plus a server-sent events endpoint for streaming agent output. Every endpoint except the Better Auth handler requires an authenticated session; unauthenticated requests return `401`.

## Authentication

Better Auth mounts its full handler at `/api/auth/[...all]`. Sign in through GitHub OAuth at `/login`. Successful sign-in writes two HttpOnly cookies:

- `GITHUB_ACCESS_TOKEN_COOKIE` — the user's GitHub OAuth access token.
- `GITHUB_INSTALLATION_ID_COOKIE` — the numeric GitHub App installation ID resolved for the user.

API routes read these cookies to mint short-lived installation tokens. They are never returned to the browser.

## Threads

### `POST /api/threads`

Creates a thread and its corresponding LangGraph thread.

Request body:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `sandboxId` | string | no | Daytona sandbox identifier; defaults to the generated thread id |
| `repoUrl` | string | no | Repository URL stored in thread metadata |
| `branch` | string | no | Branch stored in thread metadata |
| `title` | string | no | Display title stored in thread metadata |

Response: `{ "id": "<thread id>" }`

### `GET /api/threads/[threadId]`

Returns the thread plus its agent messages. Only the owning user can read it.

Response:

```json
{
  "thread": { "id": "...", "sandboxId": "...", "metadata": {}, "createdAt": "...", "updatedAt": "..." },
  "messages": []
}
```

Status codes: `401` unauthenticated, `404` missing or foreign thread.

### `POST /api/threads/[threadId]/run`

Starts an agent run and blocks until it finishes.

Request body:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `query` | string | yes | Task description for the agent |
| `repoUrl` | string | yes | Repository to operate on |
| `branch` | string | no | Base branch |

Response: `{ "summary": "..." }`

### `POST /api/threads/[threadId]/stream`

Streams agent events as SSE. With a `query`, it starts a new run; without one, it reconnects to the active run. The stream emits `values`, `messages`, and `messages-tuple` events and closes when the run ends.

The request body is parsed with Zod and accepts the LangGraph `input`/`config` shape; `repoUrl` and `branch` may also be provided at the top level or fall back to thread metadata. Invalid bodies return `400`.

### `POST /api/threads/[threadId]/run/cancel`

Interrupts the thread's running agent run.

Response: `{ "ok": true }`

## GitHub

### `GET /api/github/repositories`

Lists repositories accessible to the user's GitHub App installation.

Response: `{ "repositories": [...] }`

### `GET /api/github/branches?owner=<owner>&repo=<repo>`

Lists branches for a repository. Missing `owner` or `repo` returns `400`.

Response: `{ "branches": [...] }`

### `GET /api/github/installation-token`

Mints a fresh installation access token for the current user.

Response: `{ "installationId": <number>, "token": "...", "expiresAt": "..." }`

## Error shape

Errors are JSON with an `error` field: `{ "error": "<message>" }`. Common messages are `Unauthorized`, `Thread not found`, and `GitHub installation ID missing`.
