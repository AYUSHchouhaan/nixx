# Debugging the `/stream` Endpoint — Full Flow, Logs, and Failure Points

This document is a working guide to the `POST /api/threads/:threadId/stream` endpoint. It explains the entire runtime path from the browser to the Daytona sandbox and back, where logs appear at every layer, how to trace a run, and the concrete bugs and failure points present in the current source.

It is written from the current code. Where the source has a bug or a gap, that is stated explicitly so you know what to fix before relying on it.

---

## 1. Why this endpoint is hard to debug

`/stream` is not a single function. A single HTTP request crosses five processes and three external systems:

```text
Browser (React / useStream)
  -> Next.js route handler   (apps/web)              [process 1]
  -> LangGraph SDK client    (apps/web)              [still process 1]
  -> LangGraph Server        (apps/agent-brain)      [process 2]
  -> Redis / BullMQ queue                             [external system A]
  -> Sandbox worker          (apps/sandbox-worker)   [process 3]
  -> Daytona sandbox                                  [external system B]
  -> GitHub (clone, branch, PR, push)                [external system C]
```

An error can originate in any of those layers, and by the time it reaches the browser it is often reduced to a single SSE `error` event or a truncated stream. The way to debug it is to know which layer to look at first, and to have enough logging at each layer to see where the run died.

---

## 2. The full flow, step by step

### 2.1 Browser side

1. `ChatClient` (`apps/web/app/app/[id]/chat-client.tsx`) mounts and creates a LangGraph SDK `useStream` hook with:
   - `assistantId` implicit (`coding`, via `streamAgent`),
   - `threadId` equal to the database thread id,
   - `messagesKey: "messages"`,
   - a `FetchStreamTransport` pointing at `/api/threads/${threadId}/stream`.

2. On first load of a brand-new thread, the page passes `initialPrompt` (read from the `?prompt=` query string that `AppShell` appended on navigation). `ChatClient` consumes it once and calls `stream.submit(...)`.

3. `stream.submit()` serializes the request as the LangGraph SDK input envelope and POSTs it to the stream route.

The body the route actually receives looks like:

```json
{
  "input": {
    "query": "the task text",
    "notes": "",
    "repoUrl": "https://github.com/owner/repo.git",
    "branch": "main",
    "multitask_strategy": "interrupt"
  }
}
```

### 2.2 Next.js route (`apps/web/app/api/threads/[threadId]/stream/route.ts`)

The route runs in this order:

1. `runtime = "nodejs"`, `dynamic = "force-dynamic"` — required so SSE is not cached or run on Edge.
2. Resolve Better Auth session → plain-text `401 "Unauthorized"` if missing.
3. `streamRequestBodySchema.parse(await request.json())` → parse and validate the body.
4. Extract `query` from `input.query ?? query`. `400 "query is required"` if empty.
5. Load the thread row from Postgres. `404 "Thread not found"` if missing or owned by another user.
6. Resolve `repoUrl` and `branch` with precedence:

   ```text
   config.configurable.repo_url
     ?? input.repoUrl
     ?? top-level repoUrl
     ?? thread.metadata.repoUrl
   ```

   `400 "repoUrl is required"` if still empty.

7. Compute `sandboxId = thread.sandboxId ?? threadId`.
8. Read the GitHub installation id from the `GITHUB_INSTALLATION_ID_COOKIE` cookie. `401` if missing.
9. Mint a short-lived GitHub App installation token via `createInstallationToken`.
10. Call `streamAgent(...)` from `apps/web/app/lib/agent-brain.ts`, which returns an async generator.
11. Pump that generator into a `ReadableStream` and encode each chunk as SSE:

    ```text
    event: <chunk.event>
    data: <JSON.stringify(chunk.data)>

    ```

12. If the generator throws mid-stream, emit one `error` event:

    ```json
    { "error": "stream_failed", "message": "<message>" }
    ```

    and close the stream.

### 2.3 LangGraph SDK client (`apps/web/app/lib/agent-brain.ts`)

`streamAgent`:

1. Calls `createAgentThread(threadId)` — `client.threads.create({ threadId, ifExists: "do_nothing" })`.
2. Calls `client.runs.stream(threadId, "coding", { input, config, multitaskStrategy, streamMode: ["messages-tuple", "values"] })`.

The `config.configurable` it builds carries every value the graph later reads:

```ts
{
  thread_id: threadId,
  sandbox_id: sandboxId,
  repo_url: repoUrl,
  branch,
  installation_token,
}
```

These are passed at invocation time, not at graph construction time.

### 2.4 LangGraph Server (`apps/agent-brain/src/graph.ts`)

The server:

1. Loads `.env`.
2. Throws at startup if `DATABASE_URL` is missing.
3. Starts the sandbox result consumer (`startResultConsumer()`).
4. Creates a `PostgresSaver` checkpointer and calls `checkpointer.setup()`.
5. Creates the programmer graph with a `BullMqSandboxClient` and the checkpointer.
6. Exposes it as assistant `coding` on `http://localhost:4000`.

### 2.5 The graph (`packages/agent/programmer/graph.ts`)

Node sequence:

```text
START
  -> prepare-sandbox
  -> create-empty-pr
  -> generate-action
        -> take-action            (loop back to generate-action)
        -> open-pull-request      (when mark_task_complete or no tool call)
  -> open-pull-request
  -> end-conclusion
  -> END
```

Each node reads its inputs from `config.configurable` via `getConfigurableString` (in `packages/agent/programmer/lib/config.ts`).

### 2.6 Sandbox provisioning and command bridge

Sandbox work does **not** happen in the agent process. It crosses Redis/BullMQ:

```text
graph node
  -> BullMqSandboxClient.call/provision   (apps/agent-brain/src/bullmq-sandbox-client.ts)
  -> agent-to-sandbox queue
  -> sandbox-worker                        (apps/sandbox-worker/src/main.ts)
  -> Daytona SDK                           (apps/sandbox-worker/src/{provision,executor}.ts)
  -> sandbox-to-agent queue
  -> result-consumer                       (apps/agent-brain/src/result-consumer.ts)
  -> pending-calls map                     (apps/agent-brain/src/pending-calls.ts)
  -> original await resumes
```

`BullMqSandboxClient` generates a `commandId` per request, stores the Promise callbacks in an in-memory map keyed by that id, and enqueues the message. The result consumer matches the incoming result by the same `commandId` and resolves the waiting Promise.

There is a hard timeout of `120_000 ms` on every sandbox call (`CALL_TIMEOUT_MS` in `bullmq-sandbox-client.ts`).

### 2.7 Back to the browser

LangGraph's `streamMode: ["messages-tuple", "values"]` emits `messages` (tuples) and `values` (full state) events. The route forwards them verbatim. `useStream` on the client interprets them and `ChatClient` renders human/agent/tool rows.

---

## 3. Component and file map

| Layer | File | Key export / responsibility |
|---|---|---|
| Chat UI | `apps/web/app/app/[id]/chat-client.tsx` | `ChatClient`, `useStream`, `stream.submit` |
| Thread page | `apps/web/app/app/[id]/page.tsx` | Auth check, thread load, passes props to `ChatClient` |
| Stream route | `apps/web/app/api/threads/[threadId]/stream/route.ts` | SSE response, auth, repo/branch/token resolution |
| LangGraph client helpers | `apps/web/app/lib/agent-brain.ts` | `streamAgent`, `runAgent`, `createAgentThread`, `getThreadMessages` |
| Request/state schemas | `apps/web/app/lib/agent-types.ts` | `streamRequestBodySchema`, `threadStateSchema`, `chatMessageSchema` |
| GitHub token helpers | `apps/web/app/lib/github-installation.ts` | `createInstallationToken`, `getInstallationId` |
| Auth + cookies | `apps/web/app/lib/auth.ts` | `auth`, `getGitHubInstallationId`, cookie storage |
| LangGraph server | `apps/agent-brain/src/graph.ts` | `graph` export, checkpointer, result consumer |
| Sandbox client | `apps/agent-brain/src/bullmq-sandbox-client.ts` | `BullMqSandboxClient` (queue bridge) |
| Result consumer | `apps/agent-brain/src/result-consumer.ts` | Matches results to pending calls |
| Pending-call registry | `apps/agent-brain/src/pending-calls.ts` | In-memory `commandId -> Promise` map |
| Graph definition | `packages/agent/programmer/graph.ts` | `createProgrammerGraph`, routing |
| Graph state | `packages/agent/programmer/types.ts` | `ProgrammerStateAnnotation` |
| Graph nodes | `packages/agent/programmer/nodes/*.ts` | `prepare-sandbox`, `create-empty-pr`, `generate-action`, `take-action`, `open-pull-request`, `end-conclusion` |
| Agent tools | `packages/agent/programmer/tools/*.ts` | `read`, `glob`, `grep`, `run`, `create_file`, `edit`, `mark_task_complete` |
| Config reader | `packages/agent/programmer/lib/config.ts` | `getConfigurableString` |
| GitHub PR API | `packages/agent/programmer/lib/github.ts` | `createEmptyPullRequest` |
| Sandbox git | `packages/agent/programmer/lib/sandbox-git.ts` | checkout/commit/push helpers |
| Diagnostics | `packages/agent/programmer/lib/diagnostics.ts` | `emitGraphDiagnostic` (currently unused) |
| Contracts | `packages/contracts/src/*.ts` | Queue names, message types, `SandboxClient` |
| Sandbox worker | `apps/sandbox-worker/src/main.ts` | BullMQ consumer |
| Sandbox executor | `apps/sandbox-worker/src/executor.ts` | Runs commands inside Daytona |
| Sandbox provisioner | `apps/sandbox-worker/src/provision.ts` | Clone/reuse repo, git config |
| Daytona client | `apps/sandbox-worker/src/daytona.ts` | `daytonaClient()`, sandbox params |
| DB schema | `packages/db/src/schema.ts` | `threads`, Better Auth tables |

---

## 4. Where logs come from

There are three runtime processes, each with its own terminal. Debugging means watching the right one for the right symptom.

### 4.1 Web / Next.js (`apps/web`)

Run:

```powershell
bun run dev --filter=web
```

Shows:

- HTTP status of route handlers (`401`, `400`, `404`, `500`).
- Uncaught exceptions in the stream route (e.g. Zod parse failures).
- Better Auth session resolution errors.

The stream route itself does **not** add explicit logging. If you want visibility here, add `console.error`/`console.info` around the `buildStream` result and the `for await` loop.

### 4.2 LangGraph Server (`apps/agent-brain`)

Run:

```powershell
bun run dev --filter=agent-brain
```

Shows:

- Graph node transitions and any node that throws.
- OpenAI model invocation errors.
- Sandbox command timeouts and result-consumer rejections.
- Startup failures (`DATABASE_URL is required`).

This is the most important terminal for agent logic. When a run dies inside the graph, the stack trace lands here.

### 4.3 Sandbox worker (`apps/sandbox-worker`)

Run:

```powershell
bun run dev --filter=sandbox-worker
```

Shows:

- Daytona sandbox create/get/clone activity.
- `executeSandboxCommand` execution.
- Startup failure if `DAYTONA_API_KEY` is missing.

### 4.4 What the diagnostic helper would log (but currently does not)

`packages/agent/programmer/lib/diagnostics.ts` defines:

```ts
export function emitGraphDiagnostic(diagnostic) {
  const payload = { type: GRAPH_DIAGNOSTIC_EVENT, ...diagnostic, timestamp: ... };
  console.info("[langgraph]", payload);
}
```

**This helper is not imported or called anywhere.** Grep for `emitGraphDiagnostic` returns only the definition file. So no `[langgraph]` diagnostic events are ever emitted. The infrastructure exists but is dead code — see section 7.

---

## 5. Debugging toolkit

### 5.1 Smoke tests

The repo has three standalone checks that isolate each external system:

```powershell
bun run test:server --filter=agent-brain     # LangGraph /ok + /info + coding assistant
bun run test:redis --filter=@repo/contracts  # Redis + BullMQ round-trip
bun run test:sandbox --filter=sandbox-worker # Daytona create + echo command
```

Run them in this order. If any fails, the failure is upstream of the stream route and you do not need to look at the graph yet.

### 5.2 Typecheck

```powershell
bun run check-types
```

Catches broken imports and schema mismatches before runtime.

### 5.3 Direct curl against the stream endpoint

The route requires a valid Better Auth session cookie and the GitHub installation cookie. The cleanest approach is to copy the cookies out of the browser's DevTools (Application → Cookies) and replay the request:

```powershell
curl -N `
  -H "Content-Type: application/json" `
  -H "Cookie: <session cookie>; GITHUB_INSTALLATION_ID_COOKIE=<id>" `
  -d '{"input":{"query":"test","notes":"","repoUrl":"https://github.com/owner/repo.git","branch":"main","multitask_strategy":"interrupt"}}' `
  "http://localhost:3000/api/threads/<threadId>/stream"
```

`-N` disables buffering so you see the SSE events as they arrive. This bypasses the React layer and tells you whether the backend stream itself is working.

### 5.4 Inspect Redis queues

If a run hangs, check whether a message is stuck in a queue:

```powershell
bunx tsx packages/contracts/scripts/test-redis.ts
```

or inspect BullMQ queues directly with a small script. A run that reaches `prepare-sandbox` but never finishes usually means a `provision` or `command` message was never consumed, or its result never made it back.

---

## 6. Tracing a run — the checkpoints

Work through these in order. Each one isolates one layer.

1. **Does the request reach the route?** Watch the web terminal. If you do not see any activity, the request is blocked before the route (auth redirect, wrong URL, CORS, proxy).
2. **Does the route validate?** A `400`/`401`/`404` here is before the stream opens. Confirm `query`, `repoUrl`, thread ownership, and the installation cookie.
3. **Does the token mint succeed?** If `createInstallationToken` throws, the problem is `GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` / the installation id cookie — not the agent.
4. **Does agent-brain receive the run?** Watch the agent-brain terminal for graph activity. If nothing appears, `AGENT_BRAIN_URL` is wrong or agent-brain is down.
5. **Does `prepare-sandbox` complete?** It blocks on Daytona provisioning via BullMQ. A hang here is Redis, the sandbox worker, or Daytona — not the model.
6. **Does `create-empty-pr` complete?** A failure here is GitHub (branch/PR creation) or sandbox git (fetch/checkout/push). This is where multi-turn re-runs currently break (see section 7.3).
7. **Does `generate-action` return?** A hang/failure here is the OpenAI model (API key, model name, rate limit).
8. **Do tool calls round-trip?** `take-action` → sandbox → result. Watch both agent-brain and sandbox-worker terminals. A stuck command is a queue or timeout issue.
9. **Does the stream reach the browser?** If backend completes but the UI is empty, check the SSE shape and the `chatMessageArraySchema` parse in `ChatClient`.

---

## 7. Concrete bugs and failure points in the current source

### 7.1 Diagnostic logging is dead code

**File:** `packages/agent/programmer/lib/diagnostics.ts`

`emitGraphDiagnostic` is defined but never called from any node. The `console.info("[langgraph]", ...)` line will never run.

**Fix:** import `emitGraphDiagnostic` in `prepare-sandbox` and `create-empty-pr` and wrap their operations with `started`/`completed`/`failed` events. This is the single highest-value change for debugging, because those two nodes are the ones that hang or fail silently against external systems.

### 7.2 `prepare-sandbox` duplicates the config reader

**File:** `packages/agent/programmer/nodes/prepare-sandbox.ts`

It defines its own local `getConfigurableString` instead of importing the shared one from `../lib/config`. If you add logging or validation to `lib/config.ts`, `prepare-sandbox` will not get it.

**Fix:** import `getConfigurableString` from `../lib/config` and delete the local copy.

### 7.3 `create-empty-pr` is not idempotent (multi-turn runs fail)

**Files:**
- `packages/agent/programmer/lib/github.ts` — `createEmptyPullRequest`
- `packages/agent/programmer/nodes/create-empty-pr.ts`

`createEmptyPullRequest` always:

1. Creates branch `refs/heads/nixx/{threadId}` via `git.createRef`.
2. Creates a PR via `pulls.create`.

On the **first** run for a thread this works. But LangGraph checkpoints do not skip side-effecting nodes. When the user submits a second prompt on the same thread, the graph runs `prepare-sandbox -> create-empty-pr -> ...` again with the same `threadId`. The branch already exists, so `git.createRef` returns `422 Reference already exists`, and the run fails before the model is even called.

Sandbox provisioning is made idempotent (`provision.ts` reuses by name/directory), but PR creation is not.

**Fix:** in `createEmptyPrNode`, first check whether `state.pullRequest` is already set (from the checkpoint) and skip branch/PR creation if so. Alternatively, catch the "already exists" error and fetch the existing branch/PR. This is required for any resumed or second-prompt run.

### 7.4 The 120s sandbox timeout is too short for real work

**File:** `apps/agent-brain/src/bullmq-sandbox-client.ts` — `CALL_TIMEOUT_MS = 120_000`

Any sandbox command longer than 2 minutes (e.g. `npm install`, a large test suite, a build) rejects with:

```text
Sandbox timeout for command <commandId>
```

**Fix:** raise the timeout, or make it configurable per-command (fast commands vs. build/install). At minimum expose it via env var rather than a hardcoded constant.

### 7.5 `take-action` runs only the first tool call and swallows errors

**File:** `packages/agent/programmer/nodes/take-action.ts`

Two issues:

1. Only `lastAI.tool_calls[0]` is executed. If the model emits multiple tool calls in one message, the rest are dropped, and the graph loops back to `generate-action`. This can cause the model to re-emit the same first call repeatedly.
2. Tool errors are caught and converted into a `ToolMessage` string (`Error invoking ...`), so a failing tool never fails the graph. A sandbox timeout therefore becomes ordinary tool output that the model may retry indefinitely.

**Fix:** at minimum, log the caught error so it is visible in the agent-brain terminal. Consider executing all tool calls (or routing each as a separate step) and treating `sandboxClient` rejections as run failures rather than tool output.

### 7.6 `streamRequestBodySchema.parse` throws on malformed JSON

**File:** `apps/web/app/api/threads/[threadId]/stream/route.ts`

`streamRequestBodySchema.parse(await request.json())` is not wrapped in try/catch. A non-JSON body or a shape that fails validation throws before any SSE headers are set, and Next.js returns an HTML `500` page. The client then cannot parse it.

**Fix:** wrap the parse in try/catch and return a JSON or plain-text `400` with a clear message, matching the route's existing error convention.

### 7.7 `getThreadMessages` hides all failures

**File:** `apps/web/app/lib/agent-brain.ts` — `getThreadMessages`

The entire body is wrapped in `try { ... } catch { return []; }`. If agent-brain is down or the checkpoint query fails, the page silently loads with an empty chat. There is no signal that something is wrong until the user tries to submit.

**Fix:** log the swallowed error (`console.error`) and optionally return a flag so the UI can show "could not load history" instead of pretending the thread is empty.

### 7.8 Multi-turn `generate-action` does not add a fresh human message

**File:** `packages/agent/programmer/nodes/generate-action.ts`

On the first run, `messageHistory.length === 0`, so it includes `firstTaskMessage` (a `HumanMessage` with the query). On a resumed run, `messageHistory.length !== 0`, so the new query is **only** present in the system prompt (`buildSystemPrompt(state.query)`), never as a new human message. The model sees the new task in the system prompt but not in the conversational history, which can confuse multi-turn behavior.

**Fix:** on resumed runs, append a fresh `HumanMessage` with the current `state.query` before the history slice, so the new task is a first-class message.

### 7.9 Stale docs vs. current behavior

`docs/README.md` and parts of `docs/PROJECT_FLOW.md` still describe a `conversations` table and a `sessionStorage` initial-prompt handoff. The current code:

- has a single `threads` table (no `conversations`),
- passes the initial prompt via the `?prompt=` query string (`app-shell.tsx`), not `sessionStorage`.

Do not use those older docs as the source of truth for the stream flow; use `docs/THREAD_FLOW.md`, `docs/ENDPOINTS.md`, and this document.

---

## 8. What to implement to make it debuggable

In priority order:

1. **Wire up `emitGraphDiagnostic`** in `prepare-sandbox` and `create-empty-pr`. Emit `started` before the external call and `completed`/`failed` after, with `durationMs` and the error. This turns the two most opaque nodes into greppable `[langgraph]` log lines.

2. **Add a correlation id to every log line.** The thread id is already available via `config.configurable.thread_id`. Prefix node logs with it so you can grep one run across the whole terminal:

   ```ts
   console.info(`[langgraph] thread=${threadId} node=prepare-sandbox status=started`);
   ```

3. **Add explicit logging in the stream route** around:
   - body parse (and wrap it in try/catch per 7.6),
   - `buildStream` result (`ok` vs `!ok` and the status),
   - the `for await` loop (count chunks, log the first `error` event).

4. **Log the sandbox worker's command dispatch.** In `apps/sandbox-worker/src/main.ts`, log each job's `type` and `commandId` when received, and the result when published. This gives you both ends of the queue bridge.

5. **Expose the sandbox timeout as env.** Replace `CALL_TIMEOUT_MS` with a configurable value so you can raise it while debugging long commands.

6. **Add a `?trace=1` debug mode** to the route (or a `DEBUG_STREAM` env flag) that, when set, emits a `debug` SSE event at each milestone. This lets you see progress directly in the browser without reading three terminals.

---

## 9. Quick reference — where a symptom points

| Symptom | Most likely layer | Check |
|---|---|---|
| `401 Unauthorized` (plain text) | Auth | Session cookie expired/missing |
| `401` `GitHub installation ID missing` | Cookies | `GITHUB_INSTALLATION_ID_COOKIE` not set; re-login |
| `400 query is required` | Request shape | `input.query` empty or body not JSON |
| `400 repoUrl is required` | Request shape / metadata | Thread has no `metadata.repoUrl` and none sent |
| `404 Thread not found` | DB / ownership | Wrong thread id or wrong user |
| `500` JSON `{ error }` before stream | Token mint / graph start | GitHub App creds, installation cookie |
| Stream opens then `error` event | Graph / queue / sandbox | Check agent-brain terminal stack trace |
| Hangs at "Agent is working" forever | Queue bridge | Redis down, sandbox worker down, or 120s timeout |
| Empty chat on load | `getThreadMessages` | agent-brain down; error swallowed |
| Second prompt on same thread fails | `create-empty-pr` | Branch/PR already exists (see 7.3) |
| Model repeats same tool call | `take-action` | Only first tool call executed (see 7.5) |

---

## 10. Recommended startup for debugging

Run all three processes in separate terminals, plus Redis:

```powershell
# Redis must be running first (localhost:6379)

# Terminal 1 — sandbox worker (Daytona)
bun run dev --filter=sandbox-worker

# Terminal 2 — agent brain (LangGraph)
bun run dev --filter=agent-brain

# Terminal 3 — web (Next.js)
bun run dev --filter=web
```

Verify in order:

```powershell
bun run test:redis --filter=@repo/contracts
bun run test:sandbox --filter=sandbox-worker
bun run test:server --filter=agent-brain
```

Then open `http://localhost:3000`, start a task, and follow the checkpoints in section 6 while watching the three terminals.
