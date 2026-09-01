# Nixx Thread Flow

This document explains what happens when a thread is opened, when a new task is started, and when another prompt is submitted on an existing thread.

## The central rule

The canonical browser URL is only:

```text
/app/{threadId}
```

The thread id identifies the application thread, the LangGraph checkpoint thread, and the default sandbox identity. Prompt, repository, and branch values are not placed in the thread URL.

The branch-listing API still uses its own internal request query string:

```text
/api/github/branches?owner={owner}&repo={repo}
```

Those API parameters are unrelated to thread navigation.

## Main objects and where they live

| Object | Stored or created in | Purpose |
|---|---|---|
| `threadId` | `threads.id` in Postgres and the `/app/{threadId}` path | Identifies one user's coding session across the browser and backend |
| Thread metadata | `threads.metadata` in Postgres | Stores the repository URL, base branch, and display title |
| Chat messages | LangGraph Postgres checkpoints | Stores human, AI, and tool messages used to rebuild the chat |
| `sandboxId` | `threads.sandbox_id`, or the thread id fallback | Identifies the Daytona sandbox reused by the session |
| `commandId` | In-memory agent map plus Redis messages | Correlates one sandbox command with its result; it is not the thread id |
| Initial handoff prompt | Browser `sessionStorage`, briefly | Transfers the first prompt from `/app` to the new `/app/{threadId}` page without putting it in the URL |
| GitHub installation id | HttpOnly cookie | Lets the backend mint a short-lived installation token |
| LangGraph checkpoint | Shared Postgres database | Allows later runs to use the same graph thread and message history |

## Flow A — Start a task from `/app`

### 1. The browser collects task context

`apps/web/app/app/app-shell.tsx` holds three important values:

- `prompt`: the text entered in the landing composer;
- `selectedRepo`: the selected GitHub repository;
- `selectedBranch`: the selected base branch.

When a repository changes, the browser calls:

```text
GET /api/github/branches?owner={owner}&repo={repo}
```

The backend uses the authenticated GitHub App installation to return the available branches. This query string is only for loading branch choices.

### 2. Enter or “Run task” creates the application thread

Pressing Enter without Shift, or clicking “Run task”, invokes `handleSubmit`.

The browser sends:

```http
POST /api/threads
Content-Type: application/json
```

```json
{
  "repoUrl": "https://github.com/owner/repository.git",
  "branch": "main",
  "title": "first 60 characters of the prompt"
}
```

`apps/web/app/api/threads/route.ts` then:

1. Resolves the Better Auth session.
2. Generates a UUID with `randomUUID()`.
3. Inserts a `threads` row owned by the signed-in user.
4. Stores `repoUrl`, `branch`, and `title` in the row's JSON metadata.
5. Returns `{ "id": "..." }`.

The initial prompt is not stored in the URL. The browser writes it briefly to:

```text
sessionStorage key: nixx:initial-prompt:{threadId}
```

This is a one-time browser handoff, not durable chat storage.

### 3. The browser navigates to the clean URL

The browser performs:

```text
router.push(`/app/${threadId}`)
```

The resulting URL contains no `prompt`, `repoUrl`, or `branch` query parameters:

```text
/app/8f0c...-thread-uuid
```

Repository and branch remain available from the newly created thread's database metadata.

## Flow B — Load a thread by clicking it

Thread cards in `apps/web/app/app/app-shell.tsx` link directly to:

```text
/app/{threadId}
```

No agent run starts just because the link is opened.

### 1. Next.js authorizes the page

`apps/web/app/app/[id]/page.tsx`:

1. Resolves the Better Auth session.
2. Redirects to `/login` if there is no session.
3. Reads `id` from the path.
4. Loads the matching row from Postgres.
5. Verifies that `thread.userId` matches the session user.
6. Calls `getThreadMessages(id)` to read the LangGraph checkpoint state.
7. Calls `notFound()` when the thread does not exist or belongs to another user.

Returning `404` for both cases prevents the page from revealing another user's thread ids.

### 2. The page passes durable data to the client

The page reads repository and branch from `thread.metadata`, not from URL parameters. It passes these values and the recovered messages to `ChatClient`:

```text
threadId
repoUrl
branch
initialMessages
```

`ChatClient` creates a LangGraph `useStream` instance with:

- assistant id `coding`;
- the same `threadId`;
- `initialValues.messages` set to the loaded messages;
- `FetchStreamTransport` pointing to `/api/threads/{threadId}/stream`.

The loaded human, AI, and tool messages render immediately. Opening the page is read-only; it does not call the stream endpoint.

### 3. The initial handoff is different from an existing-thread click

For a newly created thread, `ChatClient` checks the one-time session-storage key. If it finds a prompt and the thread has no existing messages, it:

1. Marks the handoff as consumed.
2. Removes the key from `sessionStorage`.
3. Submits the prompt to the same stream endpoint used by every later prompt.

For an existing thread opened from a card, there is no handoff key, so the client only displays the loaded history and waits for a new prompt.

This prevents a browser refresh from running the initial task again.

## Flow C — Submit a prompt on a loaded thread

The thread-page composer in `apps/web/app/app/[id]/chat-client.tsx` supports:

- Enter to submit;
- Shift+Enter to insert a newline;
- the “Run task” button to submit.

The client trims the draft and ignores empty prompts or submissions while another stream is running.

It calls:

```text
POST /api/threads/{threadId}/stream
```

The LangGraph transport sends the prompt in its input envelope. The relevant values are:

```json
{
  "input": {
    "query": "the text entered in the composer",
    "notes": "",
    "repoUrl": "https://github.com/owner/repository.git",
    "branch": "main",
    "multitask_strategy": "interrupt"
  }
}
```

The URL contains only the path id. The repository and branch are also already persisted in thread metadata, so the stream route can recover them if they are not present in the request.

## Flow D — What the streaming route does

`apps/web/app/api/threads/[threadId]/stream/route.ts` runs on the Node runtime and forces a dynamic response because SSE must not be cached.

Before streaming begins, it:

1. Resolves the Better Auth session.
2. Extracts `query` from `input.query` or the supported top-level fallback.
3. Loads the thread by `threadId`.
4. Verifies thread ownership.
5. Resolves `repoUrl` and `branch` from runtime configuration, request input, or thread metadata.
6. Uses `thread.sandboxId ?? threadId` as the sandbox id.
7. Reads the GitHub installation id from the HttpOnly cookie.
8. Mints a short-lived GitHub App installation token.
9. Calls `streamAgent()` with the thread, sandbox, prompt, repository, branch, and token.

If validation fails before the stream opens, the route returns an HTTP error such as `400`, `401`, or `404`. If the underlying stream fails after it opens, it sends an SSE error event.

## Flow E — LangGraph and sandbox execution

`apps/web/app/lib/agent-brain.ts` forwards the run to the agent-brain LangGraph server.

The invocation uses:

```text
configurable.thread_id = threadId
configurable.sandbox_id = sandboxId
configurable.repo_url = repoUrl
configurable.branch = branch
configurable.installation_token = short-lived token
```

The shared LangGraph checkpointer uses `configurable.thread_id` to associate state with the same coding session. A later prompt therefore continues the same graph thread instead of creating a separate conversation identity.

The graph normally:

1. Provisions or reuses the Daytona sandbox.
2. Clones or reuses the repository directory.
3. Creates or reuses the durable GitHub branch and pull request workflow.
4. Asks the model what action to take.
5. Sends file and shell tools through Redis/BullMQ to the sandbox worker.
6. Receives command results back through Redis.
7. Loops through model actions until completion.
8. Commits and pushes changes to the GitHub branch.
9. Writes the final summary and checkpoint state.

The browser does not access the local Nixx filesystem. Agent tools execute inside the Daytona sandbox.

## Flow F — SSE back to the browser

The stream route iterates over the LangGraph async generator. Every event is encoded as:

```text
event: {event-name}
data: {JSON event data}

```

The response is sent with `text/event-stream` and anti-buffering headers.

`useStream` consumes these events and updates the client state. The UI can render:

- the human prompt;
- assistant messages;
- tool calls and arguments;
- tool results;
- loading/running state;
- errors;
- the final graph state.

The client does not need to poll for progress. The open POST response is the live stream.

## Flow G — Submit another prompt after completion

When the existing thread is loaded again, the page recovers the latest checkpoint messages. The next composer submission uses the same `threadId` and calls the same stream endpoint.

The backend again authorizes the thread and mints the installation token. LangGraph receives the same `configurable.thread_id`, loads the latest checkpoint, appends the new human input, and continues from the saved state. New SSE events are rendered into the same chat.

The thread id does not change, the browser URL does not change, and a second application thread is not created.

## Reload and error behavior

### Reloading a loaded thread

A normal reload requests the `/app/{threadId}` page again. The server loads the thread metadata and LangGraph messages. No new agent run starts.

### Reloading immediately after starting a new task

The initial prompt handoff is deleted before the automatic stream submission. A reload therefore does not intentionally replay the prompt. The prompt and subsequent agent messages should be recovered from LangGraph checkpoint state once the run has persisted them.

### Missing or unauthorized thread

The page renders Next.js `notFound()`. The API route returns `404` without distinguishing a missing thread from another user's thread.

### Missing repository metadata

The stream route returns `400` when it cannot find a repository URL in runtime input or thread metadata. A thread created without repository context cannot start a normal coding run.

### Missing GitHub installation id

The stream route returns `401` when the installation cookie is missing. The user must complete the GitHub login flow that writes the installation credentials.

### Error during streaming

After SSE begins, the route sends an `error` event with `stream_failed` and the failure message, then closes the stream. `ChatClient` exposes the error in the chat UI.

## Final sequence diagrams

### New task

```text
/app composer
  -> POST /api/threads
  -> Postgres threads row with repo/branch/title
  -> sessionStorage handoff keyed by thread id
  -> router.push(/app/{threadId})
  -> server loads row + empty LangGraph state
  -> ChatClient consumes handoff once
  -> POST /api/threads/{threadId}/stream
  -> agent-brain / LangGraph
  -> Redis/BullMQ
  -> Daytona sandbox and GitHub
  -> SSE events
  -> ChatClient renders messages and tool activity
```

### Existing thread and another prompt

```text
click /app/{threadId}
  -> server authorizes thread
  -> load metadata from Postgres
  -> load messages from LangGraph checkpoint
  -> ChatClient renders history
  -> enter another prompt
  -> POST /api/threads/{threadId}/stream
  -> same LangGraph thread_id resumes checkpoint
  -> SSE events
  -> ChatClient renders the new run
```

## Source map

- Landing composer and thread links: `apps/web/app/app/app-shell.tsx`
- Thread page authorization and initial loading: `apps/web/app/app/[id]/page.tsx`
- Chat rendering and prompt submission: `apps/web/app/app/[id]/chat-client.tsx`
- Thread creation: `apps/web/app/api/threads/route.ts`
- Thread JSON loading contract: `apps/web/app/api/threads/[threadId]/route.ts`
- SSE stream route: `apps/web/app/api/threads/[threadId]/stream/route.ts`
- LangGraph client helpers: `apps/web/app/lib/agent-brain.ts`
- Canonical thread schema: `packages/db/src/schema.ts`
