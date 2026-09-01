# Nixx Endpoints — In-Depth Route Reference

This document explains every HTTP route in `apps/web/app/api/**` the way a developer would actually use it: the URL, the HTTP method, what the route expects on the way in, what it sends back, how it works step by step, and every error you can get.

It is written from the current source code. Where a route is intentionally minimal (for example `GET /api/users`, which currently has no handler), the document says so explicitly.

The companion to this document is `docs/PROJECT_FLOW.md`, which explains the runtime architecture around these endpoints. This document focuses on the endpoints themselves.

---

## Quick reference table

All routes live under `apps/web/app`. The base URL during development is `http://localhost:3000`.

| # | Method | Path | File | Auth required | Purpose |
|---|---|---|---|---|---|
| 1 | `GET` / `POST` | `/api/auth/[...all]` | `api/auth/[...all]/route.ts` | n/a | Better Auth login, signup, sessions, OAuth callbacks |
| 2 | `POST` | `/api/threads` | `api/threads/route.ts` | session | Create a new thread row for the current user |
| 3 | `GET` | `/api/threads/:threadId` | `api/threads/[threadId]/route.ts` | session | Load a thread plus its LangGraph messages |
| 4 | `POST` | `/api/threads/:threadId/run` | `api/threads/[threadId]/run/route.ts` | session | Run the agent against the thread and return the final summary (blocking) |
| 5 | `POST` | `/api/threads/:threadId/stream` | `api/threads/[threadId]/stream/route.ts` | session | Stream agent events to the browser over SSE |
| 6 | `GET` | `/api/github/installation-token` | `api/github/installation-token/route.ts` | session | Return a short-lived GitHub App installation token |
| 7 | `GET` | `/api/github/repositories` | `api/github/repositories/route.ts` | session | Return repositories the user's GitHub App installation can access |
| 8 | `GET` | `/api/github/branches` | `api/github/branches/route.ts` | session | Return branches for a single repository |
| 9 | `GET` | `/api/users` | `api/users/route.ts` | n/a | Reserved file, currently empty |

Note: `GET /api/threads` (a list endpoint) is **not** implemented in the current source. The home page reads the thread list directly from the database server-side, not through an API endpoint. The thread list lives in `apps/web/app/app/page.tsx`.

---

## How routes are organized

The web app uses the Next.js App Router. Each route is a TypeScript file at a path like `app/api/<something>/route.ts` exporting named functions like `GET`, `POST`, `PUT`, `DELETE`.

Every API route in this project follows the same shape:

```ts
import { NextResponse } from "next/server";
import { auth } from "<relative path>/lib/auth";
import { headers } from "next/headers";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ... route logic ...

  return NextResponse.json({ /* success payload */ });
}
```

The session is resolved from the request's incoming cookies via Better Auth. If there is no session, the route short-circuits with `401`.

Routes that work with a specific thread also load the thread from Postgres using Drizzle and verify `thread.userId === session.user.id` before doing any work. This is the authorization boundary for thread operations.

---

# 1. `GET / POST /api/auth/[...all]` — Better Auth catch-all

## File

```text
apps/web/app/api/auth/[...all]/route.ts
```

## Implementation

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
```

That's the whole route file. There are no custom handlers; Better Auth generates every endpoint.

## What this route is for

`[...all]` is a Next.js "catch-all" segment. It matches every path after `/api/auth/`, so this single file handles every Better Auth endpoint.

Better Auth registers a number of endpoints. The relevant ones for Nixx are:

- `GET /api/auth/get-session` — returns the current session if the request has a valid cookie.
- `POST /api/auth/sign-in/social` — starts a GitHub OAuth flow.
- `GET /api/auth/callback/github` — the redirect target GitHub uses after the user authorizes the OAuth app.
- `POST /api/auth/sign-out` — clears the session.
- Other endpoints for signup, password reset, and verification flows that the current Nixx UI does not use.

## Required fields

Depends on the sub-endpoint. The two that Nixx uses directly are:

### `POST /api/auth/sign-in/social`

Body:

```json
{
  "provider": "github",
  "callbackURL": "/"
}
```

- `provider` — must be `"github"`. This is the social provider id configured in `apps/web/app/lib/auth.ts`.
- `callbackURL` — where the browser lands after GitHub finishes. The login form uses `"/"`.

### `GET /api/auth/callback/github`

No request body. GitHub redirects the browser here with `code` and `state` query parameters, which Better Auth exchanges for an OAuth access token.

## Return values

Better Auth returns its standard JSON shapes. From the perspective of the browser:

- A successful sign-in sets a session cookie (the cookie is HttpOnly, signed by `BETTER_AUTH_SECRET`) and returns either the session JSON or a redirect.
- A failed sign-in returns `{ error: { message, code } }` with a `4xx` status.

## How it works step by step

The flow when a user clicks "Sign in with GitHub":

1. The browser calls `authClient.signIn.social({ provider: "github", callbackURL: "/" })` from `apps/web/app/login/login-form.tsx`. `authClient` is created by `createAuthClient()` from `better-auth/client`.
2. Better Auth's client posts to `/api/auth/sign-in/social`. The server responds with a redirect URL pointing at `https://github.com/login/oauth/authorize?...`.
3. The browser follows that redirect to GitHub.
4. The user clicks Authorize on GitHub. GitHub redirects back to `GET /api/auth/callback/github?code=...&state=...`.
5. Better Auth exchanges the `code` for an access token using `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
6. Better Auth upserts a row in `users` and a row in `accounts`. The account row stores the OAuth `access_token`.
7. Better Auth creates a `sessions` row and sets the session cookie.
8. **Crucial for Nixx**: the `auth` instance in `apps/web/app/lib/auth.ts` defines `databaseHooks.account.create.after` and `databaseHooks.account.update.after`. Both hooks fire on the first sign-in and on every subsequent sign-in. They call `storeGitHubAccountCredentials(account.accessToken)`, which:
   - Calls `getInstallationId(accessToken)` from `github-installation.ts` — this calls GitHub's `GET /user/installations` with the user's OAuth token and finds the installation whose `app_id` matches `GITHUB_APP_ID`.
   - Calls `storeGitHubCredentials(accessToken, installationId)`, which writes two HttpOnly cookies:
     - `GITHUB_ACCESS_TOKEN_COOKIE` (the OAuth token)
     - `GITHUB_INSTALLATION_ID_COOKIE` (the installation id)
9. Better Auth redirects the browser to `callbackURL`, which is `/`.

After this, every other API route in the table can authenticate the user via the session cookie and read the GitHub installation id from the cookie.

## Errors

- `400` if a Better Auth request body is malformed.
- `401` if the OAuth state does not match.
- `500` if the database is unreachable.
- "email_not_found" / Better Auth's documented GitHub email-missing error path may surface here if the GitHub OAuth response does not include an email and the configured fallback fails. Nixx's `mapProfileToUser` falls back to `${profile.login}@users.noreply.github.com`, so this normally does not block login.

---

# 2. `POST /api/threads` — Create a thread

## File

```text
apps/web/app/api/threads/route.ts
```

## Implementation

```ts
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    sandboxId?: string;
    repoUrl?: string;
    branch?: string;
    title?: string;
  };

  const id = randomUUID();
  await db.insert(threads).values({
    id,
    userId: session.user.id,
    sandboxId: body.sandboxId ?? null,
    metadata: {
      repoUrl: body.repoUrl ?? null,
      branch: body.branch ?? null,
      title: body.title ?? null,
    },
  });

  return NextResponse.json({ id });
}
```

## What this route is for

Create a new row in the `threads` table for the currently signed-in user. This is the single place where a thread is born.

Important context: in the current codebase, "thread" means the unit that links a user, a repository, and an agent run. The previous design had separate `conversations` and `threads` entities; that has been collapsed into a single `threads` table. The field is still named `threads` in the schema because that is the canonical name.

## Required fields

None of the body fields are strictly required. The route accepts an empty `{}` and creates a thread with null metadata.

| Field | Type | Required | Notes |
|---|---|---|---|
| `sandboxId` | `string` | no | Optional persistent sandbox identifier. The current frontend does not send this, so `sandboxId` is normally `null` in the row. |
| `repoUrl` | `string` | no | GitHub clone URL, e.g. `https://github.com/owner/repo.git`. The frontend sends `selectedRepo.clone_url` from Octokit's repository object. |
| `branch` | `string` | no | The base branch to work from, e.g. `"main"`. |
| `title` | `string` | no | A short label. The frontend sends the first 60 characters of the prompt. |

The schema accepts but does not validate these fields. There is no URL parser and no branch whitelist. The downstream run route requires `repoUrl` to be present; an empty body here means a later run will need to send `repoUrl` again.

## Return values

Success — `200 OK`:

```json
{ "id": "<uuid>" }
```

The `id` is the new thread id, generated with `randomUUID()`. The frontend uses it to navigate to `/app/{id}` and as the LangGraph `thread_id`.

Errors:

| Status | Body | Cause |
|---|---|---|
| `401` | `{ "error": "Unauthorized" }` | No session cookie, or the cookie is invalid. |
| `500` | thrown as-is | Database failure during `db.insert`. |

There is no explicit try/catch — a database error becomes an uncaught exception that Next.js surfaces as `500`.

## How it works step by step

1. Read cookies via `headers()` (Next.js server-side helper).
2. Ask Better Auth to resolve them into a session. Bail with `401` if there is none.
3. Parse the JSON body. The cast is unchecked; missing fields stay `undefined`.
4. Generate a UUID with Node's `crypto.randomUUID()`.
5. Insert a `threads` row using Drizzle:
   - `id` — the generated UUID.
   - `userId` — `session.user.id`. The foreign key ties the row to `users.id`.
   - `sandboxId` — `null` unless the body provided one.
   - `metadata` — a `jsonb` column holding `{ repoUrl, branch, title }`. Any field not sent is `null`.
6. Return `{ id }` as JSON.

The Drizzle schema's `createdAt` and `updatedAt` are filled by `defaultNow()`. `updatedAt` is automatically bumped by the `$onUpdate(() => new Date())` hook whenever the row is updated.

## Who calls it

`apps/web/app/app/app-shell.tsx` calls this when the user submits the composer on `/app`:

```ts
const threadRes = await fetch("/api/threads", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    repoUrl: selectedRepo.clone_url,
    branch: selectedBranch,
    title: prompt.trim().slice(0, 60),
  }),
});
const thread = (await threadRes.json()) as { id: string };
sessionStorage.setItem(`nixx:initial-prompt:${thread.id}`, prompt.trim());
router.push(`/app/${thread.id}`);
```

After getting back the id, the browser stores the initial prompt in a one-time session-storage handoff keyed by the id and navigates to `/app/{id}`. Repository URL and branch are loaded from the thread metadata; they are not thread URL query parameters.

---

# 3. `GET /api/threads/:threadId` — Load thread + messages

## File

```text
apps/web/app/api/threads/[threadId]/route.ts
```

## Implementation

```ts
import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { getThreadMessages } from "../../../lib/agent-brain";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread || thread.userId !== session.user.id) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
  const messages = await getThreadMessages(threadId);

  return NextResponse.json({
    thread: {
      id: thread.id,
      sandboxId: thread.sandboxId,
      metadata,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    },
    messages,
  });
}
```

## What this route is for

Read the persisted thread row and the latest LangGraph checkpoint messages for that thread, in a single response. Used by clients that need the current state of a thread without opening the page.

## Required fields

URL parameter:

| Segment | Value | Required |
|---|---|---|
| `:threadId` | The thread UUID returned by `POST /api/threads`. | yes |

There is no request body.

## Return values

Success — `200 OK`:

```json
{
  "thread": {
    "id": "<uuid>",
    "sandboxId": null,
    "metadata": {
      "repoUrl": "https://github.com/owner/repo.git",
      "branch": "main",
      "title": "first 60 chars"
    },
    "createdAt": "2026-08-31T...",
    "updatedAt": "2026-08-31T..."
  },
  "messages": [ ... ]
}
```

`messages` is whatever LangGraph's `client.threads.getState(threadId)` returns under `state.values.messages`. In normal use this is an array of LangChain `BaseMessage`-shaped objects: `human`, `ai`, `tool`, or `system` entries, each with `content` and optionally `tool_calls` / `tool_call_id`.

Errors:

| Status | Body | Cause |
|---|---|---|
| `401` | `{ "error": "Unauthorized" }` | No session. |
| `404` | `{ "error": "Thread not found" }` | The thread does not exist OR `thread.userId !== session.user.id`. The route deliberately returns the same status for both cases to avoid leaking the existence of other users' threads. |

## How it works step by step

1. Resolve the session from request cookies.
2. Pull `threadId` out of the dynamic route segment. Next.js 16 hands it as a Promise, hence the `await`.
3. Query the `threads` table for the row with that id. `.limit(1)` keeps the result a single row.
4. Ownership check: `thread.userId !== session.user.id` returns `404` — same status as a missing row.
5. Compute `metadata` from the JSONB column. It is typed loosely as `Record<string, unknown>` and returned as-is.
6. Call `getThreadMessages(threadId)` from `apps/web/app/lib/agent-brain.ts`. That helper creates a LangGraph SDK `Client({ apiUrl: AGENT_BRAIN_URL })`, calls `client.threads.getState(threadId)`, and returns `state.values.messages` if it is an array, otherwise `[]`. If the LangGraph call throws (for example the agent-brain is down), `getThreadMessages` catches it and returns `[]` — the route will not 500 because of a missing messages array.
7. Return both the thread and the messages.

## Who calls it

This is the JSON view of a thread. The page at `/app/[id]` (`apps/web/app/app/[id]/page.tsx`) reads the thread directly from Postgres on the server and calls `getThreadMessages` itself, so it does not hit this route. The route exists for any client that wants to refresh thread state without a full page navigation.

---

# 4. `POST /api/threads/:threadId/run` — Blocking agent run

## File

```text
apps/web/app/api/threads/[threadId]/run/route.ts
```

## Implementation (annotated)

```ts
import { NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { runAgent } from "../../../../lib/agent-brain";
import { createInstallationToken } from "../../../../lib/github-installation";
import { getGitHubInstallationId } from "../../../../lib/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  // 1. Auth
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const body = (await request.json()) as {
    query: string;
    notes?: string;
    repoUrl?: string;
    branch?: string;
  };

  // 2. Validate input
  if (!body.query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  if (!body.repoUrl) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  // 3. Load + authorize the thread
  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread || thread.userId !== session.user.id) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // 4. Resolve sandbox id (DB value OR thread id fallback)
  const sandboxId = thread.sandboxId ?? threadId;

  // 5. Mint a GitHub installation token
  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json(
        { error: "GitHub installation ID missing" },
        { status: 401 },
      );
    }
    const { token: installationToken } = await createInstallationToken(installationId);

    // 6. Run the agent (blocking)
    const { summary } = await runAgent({
      threadId,
      sandboxId,
      query: body.query,
      notes: body.notes,
      repoUrl: body.repoUrl,
      branch: body.branch,
      installationToken,
    });

    return NextResponse.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## What this route is for

Run the LangGraph `coding` agent to completion against a thread and return the final summary. This is the **blocking** path — the HTTP request stays open until the agent finishes. The active UI uses the streaming endpoint (#5) instead, but this route is the simpler "fire and wait" entry point, useful for tests, cron jobs, or one-shot CLI invocations.

## Required fields

URL parameter:

| Segment | Value | Required |
|---|---|---|
| `:threadId` | The thread UUID. | yes |

Request body:

```json
{
  "query": "Implement a feature",
  "notes": "optional context",
  "repoUrl": "https://github.com/owner/repo.git",
  "branch": "main"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `query` | `string` | **yes** | The task description. Surfaced to the model as the `query` field on the `HumanMessage`. |
| `notes` | `string` | no | Additional context. Defaulted to empty string by `runAgent`. |
| `repoUrl` | `string` | **yes** | Full GitHub HTTPS clone URL. The route returns `400` if missing. |
| `branch` | `string` | no | Base branch. Defaults to whatever the LangGraph node decides (the empty string is passed through `configurable`). |

## Return values

Success — `200 OK`:

```json
{ "summary": "..." }
```

`summary` is the text produced by the `end-conclusion` node at the end of the graph. It is the agent's high-level recap of what it did.

Errors:

| Status | Body | Cause |
|---|---|---|
| `401` | `{ "error": "Unauthorized" }` | No session. |
| `400` | `{ "error": "query is required" }` | Body has no `query`. |
| `400` | `{ "error": "repoUrl is required" }` | Body has no `repoUrl`. |
| `404` | `{ "error": "Thread not found" }` | Thread does not exist or belongs to another user. |
| `401` | `{ "error": "GitHub installation ID missing" }` | The `GITHUB_INSTALLATION_ID_COOKIE` cookie is not set. Happens if the user signed in before the auth hook that writes the cookie was wired up, or the cookie expired / was cleared. |
| `500` | `{ "error": "<message>" }` | Any failure inside `runAgent` — agent-brain unreachable, LangGraph error, GitHub App credential failure, Daytona provisioning failure, sandbox timeout. The thrown error message is included. |

## How it works step by step

1. **Auth.** Resolve the session. Return `401` if missing.
2. **Parse the body.** The cast is unchecked, so any string fields you pass are forwarded.
3. **Validate.** `query` and `repoUrl` are checked for truthiness. Empty strings count as missing.
4. **Load the thread.** A Drizzle select on `threads` filtered by `id`. `.limit(1)` collapses the result.
5. **Authorize.** `thread.userId === session.user.id`. Otherwise `404`.
6. **Compute `sandboxId`.** The schema column is optional and the current frontend never sets it, so `sandboxId` falls back to `threadId`. This id becomes the Daytona sandbox name (`nixx-{sandboxId}`), the repository path inside the sandbox (`/home/daytona/{sandboxId}`), the LangGraph configurable `sandbox_id`, and the branch suffix (`nixx/{sandboxId}`).
7. **Resolve the GitHub installation.** `getGitHubInstallationId()` reads `GITHUB_INSTALLATION_ID_COOKIE` and parses it as a number. If the cookie is missing or empty, it returns `null`.
8. **Mint a short-lived installation token.** `createInstallationToken(installationId)` uses `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` (with `\n` un-escaped) via `createAppAuth` from `@octokit/auth-app`. It calls `octokit.rest.apps.createInstallationAccessToken` and returns `{ token, expiresAt }`.
9. **Run the agent.** `runAgent` (in `apps/web/app/lib/agent-brain.ts`):
   - Creates a LangGraph SDK `Client` pointing at `process.env.AGENT_BRAIN_URL ?? "http://localhost:4000"`.
   - Calls `client.runs.create(threadId, "coding", { input, config })`. `input` is `{ query, notes }`. `config.configurable` carries `thread_id`, `sandbox_id`, `repo_url`, `branch`, `installation_token`.
   - Calls `client.runs.join(threadId, run.run_id)` and waits for the run to finish.
   - Returns `{ summary }` where `summary` is read off the join result's `summary` field.
10. **Return JSON.** `{ summary }` on success, `{ error }` on any throw.

The blocking join means this endpoint can take many seconds for a real coding task. The 30-second default fetch timeout in most browsers will fire long before the agent finishes — this route is meant for server-to-server use, not for direct browser fetches.

---

# 5. `POST /api/threads/:threadId/stream` — SSE agent stream

## File

```text
apps/web/app/api/threads/[threadId]/stream/route.ts
```

## Implementation highlights

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encode(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  // 1. Auth
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Unauthorized", { status: 401 });

  // 2. Parse the body (accepts LangGraph SDK shape OR top-level fields)
  const body = (await request.json()) as {
    input?: {
      query?: string;
      notes?: string;
      repoUrl?: string;
      branch?: string;
      multitask_strategy?: "reject" | "rollback" | "interrupt";
    } | null;
    config?: { configurable?: Record<string, unknown> };
    multitask_strategy?: "reject" | "rollback" | "interrupt";
    query?: string;
    notes?: string;
    repoUrl?: string;
    branch?: string;
  };

  const query = body.input?.query ?? body.query ?? "";
  const notes = body.input?.notes ?? body.notes ?? "";
  const inputRepoUrl = body.input?.repoUrl;
  const inputBranch = body.input?.branch;
  const multitaskStrategy =
    body.input?.multitask_strategy ?? body.multitask_strategy;
  const configurable = body.config?.configurable ?? {};

  if (!query) return new Response("query is required", { status: 400 });

  // 3. Load + authorize the thread
  const { threadId } = await params;
  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread || thread.userId !== session.user.id) {
    return new Response("Thread not found", { status: 404 });
  }

  // 4. Resolve repoUrl and branch with a precedence order
  const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
  const repoUrl =
    (typeof configurable.repo_url === "string" ? configurable.repo_url : "") ||
    inputRepoUrl ||
    body.repoUrl ||
    (typeof metadata.repoUrl === "string" ? metadata.repoUrl : "");
  const branch =
    (typeof configurable.branch === "string" ? configurable.branch : "") ||
    inputBranch ||
    body.branch ||
    (typeof metadata.branch === "string" ? metadata.branch : "");

  if (!repoUrl) return new Response("repoUrl is required", { status: 400 });

  const sandboxId = thread.sandboxId ?? threadId;

  // 5. Mint the installation token
  let stream: ReturnType<typeof streamAgent>;
  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json(
        { error: "GitHub installation ID missing" },
        { status: 401 },
      );
    }
    const { token: installationToken } = await createInstallationToken(installationId);

    stream = streamAgent({
      threadId,
      sandboxId,
      query,
      notes,
      repoUrl,
      branch,
      installationToken,
      multitaskStrategy,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start agent stream";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 6. Pump the async iterator into an SSE response
  const bodyStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encode(chunk.event, chunk.data));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Agent stream failed";
        controller.enqueue(
          encode("error", { error: "stream_failed", message }),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      void stream.return?.(undefined);
    },
  });

  return new Response(bodyStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

(Note: the inline code above is paraphrased for readability. The actual file uses backticks and the real `no-cache, no-transform` value.)

## What this route is for

Stream agent events (messages, tool calls, tool results, state updates) to the browser as they happen, using Server-Sent Events. This is the endpoint `ChatClient` consumes through the LangGraph SDK `useStream` hook.

## Required fields

URL parameter:

| Segment | Value | Required |
|---|---|---|
| `:threadId` | The thread UUID. | yes |

Request body — this route is lenient because the LangGraph SDK posts a particular shape and the browser posts a simpler one. The accepted fields are:

```json
{
  "input": {
    "query": "Implement a feature",
    "notes": "optional",
    "repoUrl": "https://github.com/owner/repo.git",
    "branch": "main",
    "multitask_strategy": "interrupt"
  },
  "config": {
    "configurable": {
      "repo_url": "https://github.com/owner/repo.git",
      "branch": "main"
    }
  },
  "multitask_strategy": "interrupt",
  "query": "Implement a feature",
  "notes": "optional",
  "repoUrl": "https://github.com/owner/repo.git",
  "branch": "main"
}
```

| Field | Source | Required | Notes |
|---|---|---|---|
| `query` | `input.query` OR top-level `query` | **yes** | The task description. Both shapes are accepted; `input.query` wins if both are present. |
| `notes` | `input.notes` OR top-level `notes` | no | Free-form context. Defaults to `""`. |
| `repoUrl` | `config.configurable.repo_url` > `input.repoUrl` > top-level `repoUrl` > `thread.metadata.repoUrl` | effectively required | Precedence is strict; the **first non-empty** wins. If none of the four is set, the route returns `400`. |
| `branch` | `config.configurable.branch` > `input.branch` > top-level `branch` > `thread.metadata.branch` | no | Same precedence as `repoUrl`. May be empty. |
| `multitask_strategy` | `input.multitask_strategy` OR top-level `multitask_strategy` | no | LangGraph SDK enum: `"reject"`, `"rollback"`, or `"interrupt"`. Defaults to whatever the SDK decides when `undefined`. The UI sends `"interrupt"`. |

Important: the route accepts a non-JSON body too, but it calls `await request.json()` first. So you must send `Content-Type: application/json` even when posting the simplified top-level shape.

## Return values

### Success — `200 OK`

A streaming SSE response. The response body is a sequence of SSE events:

```text
event: messages
data: [...]

event: values
data: {...}

event: error
data: {"error":"stream_failed","message":"..."}
```

Each event has the form:

```text
event: <chunk.event>
data: <JSON of chunk.data>

```

A blank line separates events (the `\n\n` at the end of the encoded chunk). The browser's `EventSource` (and the LangGraph SDK's `FetchStreamTransport`) parses these automatically.

The `chunk.event` values come from the LangGraph SDK `streamMode: ["messages-tuple", "values"]` setting in `streamAgent`. The most common events the UI will see are:

- `messages` — a tuple `[newMessage, chunkMetadata]` or a single message.
- `values` — the full graph state at that point, including the `messages` array.
- `error` — emitted by this route if the underlying iterator throws (for example the agent-brain connection drops mid-run).
- `end` — LangGraph's terminal event when the run finishes.

The route does not interpret or rewrite chunks. It encodes `chunk.event` and `chunk.data` verbatim. The browser is responsible for rendering them.

### Response headers

```text
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

`X-Accel-Buffering: no` disables proxy buffering, important when running behind nginx.

### Errors before the stream starts

| Status | Body | Cause |
|---|---|---|
| `401` | plain text `"Unauthorized"` | No session. Note: this is plain text, not JSON. |
| `400` | plain text `"query is required"` | No `query` found in any of the three locations. |
| `404` | plain text `"Thread not found"` | Thread does not exist or belongs to another user. |
| `400` | plain text `"repoUrl is required"` | Could not resolve `repoUrl` from any of the four precedence levels. |
| `401` | JSON `{ "error": "GitHub installation ID missing" }` | The installation cookie is missing. |
| `500` | JSON `{ "error": "<message>" }` | Anything thrown by `getGitHubInstallationId`, `createInstallationToken`, or the start of `streamAgent`. |

### Errors during the stream

Once SSE has started, errors do not produce HTTP status codes — they are emitted as a special event:

```text
event: error
data: {"error":"stream_failed","message":"<error message>"}
```

After this, the controller closes and the response ends.

## How it works step by step

1. **`runtime = "nodejs"` and `dynamic = "force-dynamic"`.** The route is forced to run on the Node.js runtime (not Edge) and never cached. SSE responses must not be cached by Next.js, hence `force-dynamic`.
2. **Auth.** Resolve session, return plain-text `401` if missing.
3. **Parse the body.** The type accepts both the LangGraph SDK envelope (`{ input, config, multitask_strategy }`) and the simpler top-level form (`{ query, notes, repoUrl, branch, multitask_strategy }`). The route extracts each field by checking both locations.
4. **Require `query`.** `400` if missing.
5. **Load the thread.** Same query as the blocking run endpoint.
6. **Authorize.** Same `thread.userId === session.user.id` check.
7. **Resolve `repoUrl` and `branch`.** The four-level precedence is described in the table above. This is what makes the same endpoint usable from both the browser (which sends `input.*`) and from any LangGraph-compatible caller that uses `config.configurable.*`.
8. **Require `repoUrl`.** `400` if empty after precedence resolution. Note that `branch` is allowed to be empty.
9. **Resolve `sandboxId`.** `thread.sandboxId ?? threadId`.
10. **Read the installation cookie.** Return `401` JSON if missing.
11. **Mint the token.** `createInstallationToken(installationId)`.
12. **Open the stream.** Call `streamAgent(...)` from `apps/web/app/lib/agent-brain.ts`. That helper returns an async generator:
    - It calls `client.runs.stream(threadId, "coding", { input, config, multitaskStrategy, streamMode: ["messages-tuple", "values"] })`.
    - It casts the SDK's stream to `AsyncGenerator<AgentStreamChunk>` where `AgentStreamChunk = { id?, event: string, data: unknown }`.
13. **Pump events into SSE.** Build a `ReadableStream<Uint8Array>`. In its `start` method, iterate over the async generator and call `controller.enqueue(encode(chunk.event, chunk.data))` for each chunk. If the iterator throws, encode an `error` event with `{ error: "stream_failed", message }` before closing.
14. **Cancel handling.** The `cancel` callback on the `ReadableStream` calls `stream.return?.(undefined)`, which signals the generator to clean up. This fires when the browser closes the connection.
15. **Send the response.** A new `Response` with the `ReadableStream` as its body and the SSE headers.

## Who calls it

The chat page at `/app/[id]` mounts a `ChatClient` that uses the LangGraph SDK:

```ts
const transport = useMemo(
  () => new FetchStreamTransport({ apiUrl: `/api/threads/${threadId}/stream` }),
  [threadId],
);

const stream = useStream({
  assistantId: "coding",
  messagesKey: "messages",
  transport,
  threadId,
  initialValues: { messages: initialMessages },
  fetchStateHistory: false,
});

await stream.submit({
  query: text,
  notes: "",
  repoUrl,
  branch,
  multitask_strategy: "interrupt",
});
```

`FetchStreamTransport` posts a JSON body matching the LangGraph SDK envelope — the same shape the route's `input.*` fields accept.

---

# 6. `GET /api/github/installation-token` — Mint a GitHub installation token

## File

```text
apps/web/app/api/github/installation-token/route.ts
```

## Implementation

```ts
import { NextResponse } from "next/server";
import { createInstallationToken } from "../../../lib/github-installation";
import { auth, getGitHubInstallationId } from "../../../lib/auth";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json(
        { error: "GitHub installation ID missing" },
        { status: 401 },
      );
    }

    const { token, expiresAt } = await createInstallationToken(installationId);

    return NextResponse.json({ installationId, token, expiresAt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get installation token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## What this route is for

Return a fresh short-lived GitHub App installation access token plus the installation id. Useful for ad-hoc client-side calls that need GitHub access outside the normal UI flows. The repositories and branches endpoints (#7 and #8) do not call this route — they mint their own tokens internally.

## Required fields

None. There is no URL parameter, no query parameter, and no request body.

The only requirement is a valid session cookie and a populated `GITHUB_INSTALLATION_ID_COOKIE`. The latter is written by Better Auth's account hooks when the user signs in with GitHub.

## Return values

Success — `200 OK`:

```json
{
  "installationId": 123456,
  "token": "ghs_...",
  "expiresAt": "2026-08-31T12:34:56Z"
}
```

| Field | Type | Source |
|---|---|---|
| `installationId` | number | Read from the cookie (which is a string but parsed to `Number`). |
| `token` | string | Returned by GitHub's `apps.createInstallationAccessToken`. |
| `expiresAt` | string (ISO 8601) | Same source — GitHub returns the UTC timestamp the token expires at. |

Errors:

| Status | Body | Cause |
|---|---|---|
| `401` | `{ "error": "Unauthorized" }` | No session. |
| `401` | `{ "error": "GitHub installation ID missing" }` | Session is fine but the installation cookie is not set. |
| `500` | `{ "error": "<message>" }` | GitHub App credentials missing, the JWT mint fails, or GitHub rejects the installation. |

## How it works step by step

1. Resolve the session. `401` if missing.
2. Read `GITHUB_INSTALLATION_ID_COOKIE`. The helper `getGitHubInstallationId()` returns the value parsed as a number, or `null` if the cookie is empty or missing.
3. Call `createInstallationToken(installationId)` from `apps/web/app/lib/github-installation.ts`:
   - Reads `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` (with `\n` un-escaped).
   - Builds an `Octokit` client authenticated as the GitHub App itself using `@octokit/auth-app`'s `createAppAuth({ appId, privateKey })` with `type: "app"`.
   - Calls `octokit.rest.apps.createInstallationAccessToken({ installation_id })`.
   - Returns `{ token: data.token, expiresAt: data.expires_at }`.
4. Return `{ installationId, token, expiresAt }` as JSON.

The returned token is short-lived (one hour by default). It is intended for installation-scoped operations: listing repos accessible to the installation, listing branches, creating refs, creating pull requests, and pushing commits from the sandbox.

---

# 7. `GET /api/github/repositories` — List installation-accessible repositories

## File

```text
apps/web/app/api/github/repositories/route.ts
```

## Implementation

```ts
import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";
import {
  createInstallationToken,
  fetchRepositories,
} from "../../../lib/github-installation";
import { getGitHubInstallationId } from "../../../lib/auth";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json({ error: "GitHub installation ID missing" }, { status: 401 });
    }

    const { token } = await createInstallationToken(installationId);
    const repositories = await fetchRepositories(token);

    return NextResponse.json({ repositories });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get repositories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## What this route is for

Return the full list of repositories the user's GitHub App installation can access. This is what populates the repository dropdown on `/app`.

## Required fields

None. No URL parameter, no query string, no body.

The route implicitly requires:

- A valid session.
- A populated `GITHUB_INSTALLATION_ID_COOKIE`.
- Valid `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` env vars (used by `createInstallationToken`).

## Return values

Success — `200 OK`:

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

The shape is whatever Octokit returns from `apps.listReposAccessibleToInstallation`. The fields shown above are the ones the UI consumes from `AppShell` (`full_name`, `owner.login`, `name`, `clone_url`, `default_branch`). Other fields returned by GitHub are present in the JSON but not used.

`fetchRepositories` uses Octokit's `paginate`, so the array contains **all** repositories accessible to the installation, across all pages.

Errors:

| Status | Body | Cause |
|---|---|---|
| `401` | `{ "error": "Unauthorized" }` | No session. |
| `401` | `{ "error": "GitHub installation ID missing" }` | Installation cookie missing. |
| `500` | `{ "error": "<message>" }` | GitHub App credential failure, network error to GitHub, or pagination failure. |

## How it works step by step

1. Resolve the session.
2. Read the installation id from the cookie.
3. Mint an installation token (`createInstallationToken`).
4. Call `fetchRepositories(token)`:
   - Creates an `Octokit({ auth: token })` client.
   - Calls `octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation)` — Octokit follows the `Link` headers until all pages are consumed.
5. Return `{ repositories }`.

## Who calls it

`apps/web/app/app/app-shell.tsx` in a `useEffect`:

```ts
const res = await fetch("/api/github/repositories");
const data = (await res.json()) as { repositories: Repository[] };
setRepositories(data.repositories);
```

This fires once when `AppShell` mounts.

---

# 8. `GET /api/github/branches` — List branches of a repository

## File

```text
apps/web/app/api/github/branches/route.ts
```

## Implementation

```ts
import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";
import {
  createInstallationToken,
  fetchBranches,
} from "../../../lib/github-installation";
import { getGitHubInstallationId } from "../../../lib/auth";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error": "Missing owner or repo query parameter" },
      { status": 400 },
    );
  }

  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json({ error: "GitHub installation ID missing" }, { status: 401 });
    }

    const { token } = await createInstallationToken(installationId);
    const branches = await fetchBranches(token, owner, repo);

    return NextResponse.json({ branches });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get branches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

## What this route is for

Return the branches for a single repository. This populates the branch dropdown after the user selects a repository in `/app`.

## Required fields

Query parameters:

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `owner` | `string` | **yes** | GitHub owner login (organization or user). |
| `repo` | `string` | **yes** | Repository name without the owner. |

No URL parameter, no body.

The route implicitly requires:

- A valid session.
- A populated `GITHUB_INSTALLATION_ID_COOKIE`.
- Valid GitHub App env vars.

## Return values

Success — `200 OK`:

```json
{
  "branches": [
    { "name": "main" },
    { "name": "develop" },
    { "name": "feature/something" }
  ]
}
```

The array is paginated to **all** branches via Octokit's `paginate`. Each element includes at least `name`. Other Octokit fields (`commit`, `protected`, etc.) are passed through.

Errors:

| Status | Body | Cause |
|---|---|---|
| `400` | `{ "error": "Missing owner or repo query parameter" }` | Either `owner` or `repo` is missing or empty. |
| `401` | `{ "error": "Unauthorized" }` | No session. |
| `401` | `{ "error": "GitHub installation ID missing" }` | Installation cookie missing. |
| `500` | `{ "error": "<message>" }` | GitHub App credential failure, repository not accessible to the installation, or network failure. Note: GitHub returns `404` when the installation cannot see the repository; the route surfaces that as `500` with GitHub's message. |

## How it works step by step

1. Resolve the session.
2. Read `owner` and `repo` from the query string. Return `400` if either is missing.
3. Read the installation id.
4. Mint an installation token.
5. Call `fetchBranches(token, owner, repo)`:
   - `new Octokit({ auth: token })`.
   - `octokit.paginate(octokit.rest.repos.listBranches, { owner, repo })`.
6. Return `{ branches }`.

## Who calls it

`apps/web/app/app/app-shell.tsx`, inside the `useEffect` that watches `selectedRepo`:

```ts
const params = new URLSearchParams({
  owner: selectedRepo.owner.login,
  repo: selectedRepo.name,
});
const res = await fetch(`/api/github/branches?${params.toString()}`);
const data = (await res.json()) as { branches: Branch[] };
setBranches(data.branches);
setSelectedBranch(
  data.branches.find((b) => b.name === selectedRepo.default_branch)?.name
    ?? data.branches[0]?.name ?? ""
);
```

It runs every time `selectedRepo` changes. If the repository has a branch matching `selectedRepo.default_branch`, that becomes the selected branch; otherwise the first branch in the list wins.

---

# 9. `GET /api/users` — Reserved, currently empty

## File

```text
apps/web/app/api/users/route.ts
```

## Current state

The file exists but contains zero bytes:

```powershell
PS D:\code\nixx> Get-ChildItem -LiteralPath .\apps\web\app\api\users\route.ts
    Directory: ...apps\web\app\api\users

Name      Length
----      ------
route.ts  0
```

A Next.js route file with no exported handler does not register any HTTP endpoint. A request to `/api/users` will not hit this file — it will fall through to Next.js's default `404`.

## What it is for

The file is reserved for a future `GET /api/users` endpoint, but the implementation is intentionally not present. There is no current consumer.

---

# How the endpoints fit together in the user flow

This is the sequence of route calls for a successful coding session:

1. **Sign in** — the browser calls Better Auth's `signIn.social`. Routes #1 handle every step.
2. **Visit `/app`** — `apps/web/app/app/page.tsx` reads the thread list from Postgres directly on the server. No API call.
3. **Load repositories** — `AppShell` mounts and calls `GET /api/github/repositories`. Route #7.
4. **Select a repository** — `AppShell` calls `GET /api/github/branches?owner=...&repo=...`. Route #8.
5. **Submit a task** — `AppShell` calls `POST /api/threads`. Route #2. Receives `{ id }`.
6. **Navigate to thread page** — `/app/{id}` loads. The page calls `getThreadMessages` directly via the LangGraph SDK; it does not hit `GET /api/threads/:threadId` (route #3).
7. **Submit the prompt** — `ChatClient.submit()` posts to `/api/threads/:threadId/stream`. Route #5.
8. **Live stream** — Route #5 mints a token via `createInstallationToken`, opens the LangGraph stream, and pumps SSE to the browser.
9. **Run completes** — final `summary` lands in `state.summary`, available through `GET /api/threads/:threadId` (route #3) on the next page load.

The blocking `POST /api/threads/:threadId/run` (route #4) is not used by the current UI. It exists as a server-to-server entry point for tests or future CLI tools. The `GET /api/github/installation-token` (route #6) is similarly not on the UI's hot path; it is exposed for ad-hoc debugging.

---

# Common patterns across routes

## Authentication

Every protected route begins with:

```ts
const session = await auth.api.getSession({ headers: await headers() });
if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

The session is resolved from the Better Auth session cookie. There is no role-based or permission-based authorization beyond "is signed in" plus the per-thread ownership check.

## Authorization on thread routes

Routes that operate on a specific thread (`GET /api/threads/:threadId`, both run routes) all perform the same pattern:

```ts
const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
if (!thread || thread.userId !== session.user.id) {
  return ... 404 ...;
}
```

A row that does not exist and a row owned by someone else both return `404` — the route does not differentiate, so an attacker cannot probe whether a given thread id exists in another user's account.

## GitHub installation token

The three GitHub routes (#6, #7, #8) and the two run/stream routes (#4, #5) all follow the same three-step pattern for GitHub access:

1. `getGitHubInstallationId()` from `apps/web/app/lib/auth.ts` reads `GITHUB_INSTALLATION_ID_COOKIE` and returns it as a `number` (or `null`).
2. `createInstallationToken(installationId)` from `apps/web/app/lib/github-installation.ts` mints a fresh token using `GITHUB_APP_ID` + `GITHUB_PRIVATE_KEY` via `@octokit/auth-app`.
3. The token is used for GitHub API calls and, in routes #4 and #5, passed into the LangGraph run configuration so the agent can use it for git operations in the sandbox.

## Error shape

The convention across the routes is:

- `401` → `{ error: "Unauthorized" }` or `{ error: "GitHub installation ID missing" }`.
- `404` → `{ error: "Thread not found" }`.
- `400` → `{ error: "<specific missing field>" }`.
- `500` → `{ error: <thrown message> }` for caught exceptions, raw error for uncaught ones.

The streaming route breaks this convention by returning **plain text** for `400`/`401`/`404` instead of JSON, because it may not have a JSON content type set on those early-return paths. The downstream `error` SSE event uses `{ error: "stream_failed", message }`.

---

# Environment variables the routes depend on

These env vars are read by `apps/web/app/lib/auth.ts` and `apps/web/app/lib/github-installation.ts`.

| Variable | Read by | Required for routes |
|---|---|---|
| `DATABASE_URL` | `db` client | All routes (every route touches the database directly or via `auth`). |
| `BETTER_AUTH_SECRET` | Better Auth | Route #1. |
| `BETTER_AUTH_URL` | Better Auth | Route #1. |
| `GITHUB_CLIENT_ID` | `auth.ts` socialProviders | Route #1 (GitHub OAuth). |
| `GITHUB_CLIENT_SECRET` | `auth.ts` socialProviders | Route #1. |
| `GITHUB_APP_ID` | `github-installation.ts` | Routes #4, #5, #6, #7, #8. |
| `GITHUB_PRIVATE_KEY` | `github-installation.ts` | Routes #4, #5, #6, #7, #8. |
| `AGENT_BRAIN_URL` | `agent-brain.ts` Client | Routes #4, #5 (also `getThreadMessages` called from route #3 indirectly). |

Missing any of these surfaces as either a `500` (with the missing-credentials message from `getAppCredentials`) or as a thrown exception that Next.js converts to `500`.

---

# Summary in plain language

In plain English, the seven real endpoints do this:

1. `/api/auth/...` — login, logout, session checks, GitHub OAuth callback. Owned by Better Auth.
2. `/api/threads` (POST) — create a new task and remember it. Returns the task's id.
3. `/api/threads/:id` (GET) — load a saved task plus its conversation history.
4. `/api/threads/:id/run` (POST) — run the agent and wait. Returns the final summary.
5. `/api/threads/:id/stream` (POST) — run the agent and stream live updates. Used by the chat UI.
6. `/api/github/installation-token` (GET) — mint a short-lived GitHub token. Handed to the agent so it can push commits.
7. `/api/github/repositories` (GET) — list the repos the user's GitHub App can see.
8. `/api/github/branches` (GET) — list the branches of one of those repos.
9. `/api/users` (GET) — placeholder file, no handler yet.

Together they form the contract between the browser, the Next.js backend, the LangGraph agent, and GitHub. The browser talks only to the web backend; the agent talks only to the web backend and the sandbox worker; GitHub is reached exclusively through web backend routes that mint short-lived installation tokens.
