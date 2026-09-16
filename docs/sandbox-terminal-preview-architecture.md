# Sandbox Terminal and Browser Preview Architecture

## Purpose

This document describes how Nixx can expose two capabilities from a Daytona sandbox inside the web frontend:

1. An interactive terminal connected to the sandbox repository.
2. A browser/preview panel that displays a web server already running inside that sandbox.

This is an architecture document only. It does not implement any of these capabilities.

The important design decision is that **preview discovery must not start a server**. Starting a server is a process-control operation. Opening a preview is an attachment/discovery operation. They should remain separate so that opening or refreshing the browser panel never unexpectedly runs a command, creates duplicate processes, or changes the sandbox.

---

## 1. Current system and its boundaries

Nixx currently has this runtime path:

```text
Browser
  |
  | HTTPS requests and LangGraph SSE
  v
apps/web
  |
  | auth, thread ownership, database, GitHub token creation
  v
apps/agent-brain
  |
  | LangGraph graph + BullMQ producer
  v
Redis
  |
  v
apps/sandbox-worker
  |
  | Daytona SDK
  v
Daytona sandbox
```

The current sandbox identity is derived from the thread:

```text
threadId
  -> threads.id
  -> LangGraph configurable.thread_id
  -> sandbox messages

sandboxId
  -> threads.sandbox_id, or threadId as fallback
  -> Daytona sandbox name: nixx-{sandboxId}
  -> repository path: /home/daytona/{sandboxId}
```

The current sandbox worker supports finite, request/response commands:

- `read_file`
- `glob`
- `grep`
- `run_command`
- `create_file`
- `edit_file`
- `git`

The current `run_command` path calls Daytona's `process.executeCommand()`. It waits for the command to finish and returns one buffered result. That is suitable for agent actions such as tests or file inspection, but not for an interactive terminal or a long-running development server.

The Daytona SDK already exposes the required lower-level primitives:

- `sandbox.process.createPty()` for an interactive pseudo-terminal.
- `sandbox.process.connectPty()` for reconnecting to an existing PTY.
- `sandbox.process.resizePtySession()` for terminal resizing.
- `sandbox.process.killPtySession()` for cleanup.
- `sandbox.process.createSession()` and `executeSessionCommand()` for persistent background processes.
- `sandbox.getPreviewLink(port)` for a URL that reaches a port inside the sandbox.

No source code currently uses those capabilities.

---

## 2. The central separation: control versus attachment

There are three different operations and they should not be combined into one endpoint.

### 2.1 Start or stop a process

This changes sandbox state. Examples:

- Start `bun run dev`.
- Start `npm run dev -- --host 0.0.0.0`.
- Stop the existing development server.
- Restart it with a different port.

This operation requires an explicit user action or an agent action. It should return process/session identity and status, not merely a URL.

### 2.2 Discover or attach to a running process

This does not start anything. It asks:

- Is a known development process already running?
- Which port does it use?
- What command/session owns that port?
- Can Daytona provide a preview URL for that port?

The browser panel can call this operation when it mounts, refreshes, or reconnects. If no process is registered or detected, the panel should show `No running preview` and offer a separate `Start server` action.

### 2.3 Connect to an interactive terminal

This opens a live bidirectional stream to a PTY. It is neither a normal command request nor a preview request.

- Browser input travels to the PTY.
- PTY output travels back to the browser.
- Resize events travel to the PTY.
- Closing the browser connection does not necessarily kill the PTY.

That last property is important. A temporary browser disconnect should not destroy the user's shell session. The PTY needs a stable session ID so a later connection can attach again.

---

## 3. Proposed components

The cleanest architecture keeps Daytona access inside `apps/sandbox-worker` and keeps browser authentication and thread ownership inside `apps/web`.

```text
apps/web
  - validates the Better Auth session
  - verifies thread ownership
  - exposes user-facing HTTP/WebSocket endpoints
  - never imports or calls the Daytona SDK

apps/sandbox-worker
  - owns Daytona SDK access
  - resolves sandboxId to a Daytona Sandbox
  - owns PTY handles and process/session lifecycle
  - exposes a private control/stream transport for apps/web

packages/contracts
  - defines typed control messages and lifecycle state
  - remains the shared vocabulary between services

packages/db
  - stores durable thread-level references and metadata if required
  - is not used to store terminal bytes or preview HTML
```

There are two viable network layouts:

### Recommended layout: worker gateway behind an internal service boundary

```text
Browser
  | HTTPS / WebSocket
  v
apps/web
  | authenticated internal HTTP / WebSocket
  v
apps/sandbox-worker
  | Daytona SDK / Daytona WebSocket
  v
Daytona sandbox
```

The worker gateway can be a Bun HTTP/WebSocket server running in the same process as, or alongside, the BullMQ worker. `apps/web` authenticates the browser request first, then makes an internal authenticated request to the gateway.

This avoids putting Daytona credentials in `apps/web` and avoids forcing browser terminal traffic through the LangGraph graph.

### Alternative layout: add interactive message types to BullMQ

```text
Browser
  v
apps/web
  v
apps/agent-brain or a dedicated relay
  v
Redis/BullMQ
  v
apps/sandbox-worker
```

BullMQ is good for durable finite jobs, but it is not ideal for high-frequency terminal input/output. A terminal can produce many small messages and needs low latency, ordering, cancellation, and reconnect behavior. Therefore BullMQ should remain the control-plane path for agent commands, while terminal data should use a direct authenticated WebSocket path.

---

## 4. Identity and authorization

Every browser request must be tied to a thread and sandbox.

### 4.1 Browser identity

The browser sends the thread ID in the URL, for example:

```text
/app/{threadId}
```

The browser does not choose an arbitrary Daytona sandbox name. It asks `apps/web` to resolve the thread.

### 4.2 Web authorization

For every terminal or preview request, `apps/web` should:

1. Read the Better Auth session from the request cookies.
2. Load the thread from Postgres.
3. Verify `thread.userId === session.user.id`.
4. Resolve `sandboxId = thread.sandboxId ?? thread.id`.
5. Ask the worker gateway to operate on that sandbox.

This must be repeated for HTTP actions and WebSocket connection establishment. A WebSocket must not be authorized only when the page initially loads.

### 4.3 Worker authorization

The worker gateway should not trust a browser-provided `sandboxId` by itself. It should accept an internal service credential or a short-lived signed capability created by `apps/web`.

A capability should contain at least:

```text
threadId
sandboxId
user/session subject or capability subject
allowed operation: terminal | preview | process-control
expiration time
unique token ID, if revocation is needed
```

The worker validates the capability before accessing Daytona. This protects the worker if it is accidentally reachable from outside the private network.

### 4.4 No secrets in the browser

The Daytona API key stays in `apps/sandbox-worker`. The browser receives only:

- A short-lived application WebSocket connection or connection token for the terminal.
- A preview URL generated by Daytona, which may include a scoped access token.

The browser must never receive `DAYTONA_API_KEY`, GitHub installation tokens, or Redis credentials.

---

## 5. Terminal architecture

### 5.1 Frontend terminal

The frontend should use a terminal emulator such as xterm.js. Its responsibilities are visual only:

- Render terminal output.
- Convert keyboard input into bytes/text.
- Report terminal dimensions.
- Reconnect using the stable PTY session ID.
- Close the connection when navigating away.

The terminal should not execute commands locally. Every keypress goes to the sandbox PTY.

Conceptually:

```text
xterm.js
  |
  | WebSocket messages
  v
apps/web terminal proxy/gateway
  |
  | authenticated WebSocket relay
  v
sandbox-worker PTY manager
  |
  | Daytona process.createPty/connectPty
  v
Daytona PTY
  |
  v
/home/daytona/{sandboxId}
```

The terminal's initial working directory should be the repository path:

```text
/home/daytona/{sandboxId}
```

### 5.2 Terminal connection lifecycle

#### First connection

1. The thread page opens the Terminal tab.
2. The frontend requests a terminal connection capability from `apps/web`.
3. `apps/web` authenticates the session and verifies thread ownership.
4. `apps/web` resolves the thread's sandbox ID.
5. The frontend opens a WebSocket using the capability.
6. The worker gateway validates the capability.
7. The worker checks whether a PTY session already exists for this thread/sandbox terminal.
8. If none exists, it calls:

```text
sandbox.process.createPty({
  id: stablePtyId,
  cwd: /home/daytona/{sandboxId},
  cols,
  rows,
  envs: { TERM: xterm-256color }
})
```

9. The worker waits for the PTY connection and begins relaying output.
10. The frontend displays the shell prompt.

The stable PTY ID should be derived from a server-controlled identity, not a random browser value. For example:

```text
terminal-{threadId}
```

If multiple terminal tabs are intended, the model can instead be:

```text
terminal-{threadId}-{terminalId}
```

where `terminalId` is created by the backend and stored or returned as an opaque identifier.

#### Input path

```text
keyboard input
  -> xterm.js onData
  -> browser WebSocket
  -> apps/web relay
  -> sandbox-worker WebSocket
  -> PtyHandle.sendInput(data)
  -> Daytona PTY
  -> shell process
```

Input must be sent as raw terminal data rather than wrapping it in a shell command. This preserves Ctrl-C, arrow keys, tab completion, escape sequences, and interactive programs.

#### Output path

```text
shell process
  -> Daytona PTY onData(Uint8Array)
  -> sandbox-worker
  -> worker WebSocket
  -> apps/web relay
  -> browser WebSocket
  -> xterm.js.write(data)
```

The worker should preserve output ordering. It should not parse terminal output into lines or JSON because terminal control sequences are meaningful to the emulator.

#### Resize path

```text
browser ResizeObserver
  -> xterm.js dimensions
  -> WebSocket resize message { cols, rows }
  -> sandbox-worker
  -> PtyHandle.resize(cols, rows)
  -> Daytona PTY
```

Resize values must be bounded to reasonable positive integers. The worker, not the browser, is the final validation boundary.

#### Disconnect and reconnect

When the browser closes its WebSocket, the worker should disconnect only the relay connection, not automatically kill the PTY. The PTY remains available for reconnection during the sandbox lifetime.

On reconnect:

1. `apps/web` re-authorizes the thread.
2. The browser presents or requests the existing terminal capability.
3. The worker calls `connectPty(stablePtyId, { onData })`.
4. Output resumes from the PTY's current state.

The architecture should define what happens to output produced while disconnected. The simplest initial policy is to show the current shell state after reconnect; a later enhancement could buffer a bounded amount of output per PTY.

#### Explicit close versus process termination

These are different actions:

- **Disconnect terminal:** close the browser relay; keep the PTY alive.
- **Exit shell:** send `exit\n` through the PTY.
- **Kill terminal session:** explicitly call `killPtySession()`.

The UI should not treat a browser tab closing as a kill request.

### 5.3 Terminal message envelope

A simple WebSocket protocol can use JSON control frames and binary/text output frames:

```text
Client -> server
{ "type": "resize", "cols": 120, "rows": 36 }
{ "type": "input", "data": "ls -la\n" }
{ "type": "close", "kill": false }

Server -> client
{ "type": "ready", "ptyId": "..." }
{ "type": "error", "message": "..." }
{ "type": "exit", "exitCode": 0 }
<binary PTY output bytes>
```

Binary output is preferable because it avoids accidental encoding or control-sequence corruption. If the relay uses text frames, it must consistently decode and encode UTF-8 without removing escape sequences.

### 5.4 Why the existing agent command path is not enough

The existing path is:

```text
agent tool
  -> BullMqSandboxClient.call()
  -> Redis job
  -> sandbox-worker
  -> executeCommand()
  -> one result message
```

That path has several properties that make it unsuitable for a terminal:

- It waits for a command to finish.
- It returns one buffered output string.
- It has a 120-second pending-call timeout in the agent brain.
- It has no browser connection to receive incremental output.
- It has no input channel for keystrokes.
- It has no resize or reconnect semantics.

The terminal therefore needs a separate streaming channel while reusing the same sandbox lookup and authorization model.

---

## 6. Preview/browser architecture

The preview is not a browser automation system. It is an iframe or browser surface that loads an HTTP application running inside the Daytona sandbox.

```text
web server process inside Daytona sandbox
  -> listens on a sandbox port, for example 3000
  -> Daytona preview gateway
  -> preview URL
  -> frontend iframe/browser panel
```

The important point is that the preview URL only exposes a port. It does not know how to start the process.

### 6.1 Starting the development server

Starting the server is a separate process-control operation. It can be initiated by either:

- An explicit `Start server` action in the terminal/preview UI.
- An agent tool or graph node that intentionally starts the server.
- A future project configuration that declares the development command.

The command should run as a persistent background process, not through `executeCommand()`.

A suitable Daytona flow is:

```text
process.createSession(serverSessionId)
process.executeSessionCommand(serverSessionId, {
  command: "bun run dev -- --host 0.0.0.0",
  runAsync: true
})
```

The exact command is project-specific. The process must bind to an address reachable by Daytona's preview gateway. For many development servers, that means `0.0.0.0` rather than only `localhost` inside the sandbox.

The process manager should record:

```text
threadId
sandboxId
serverId
sessionId
command
working directory
port
status: starting | running | stopped | failed
createdAt
lastObservedAt
```

This state can initially be held by the sandbox worker if it is the sole process owner. If the state must survive worker restarts or be shared across multiple worker instances, it should be persisted in Postgres or Redis. The database should store metadata, not live process output.

### 6.2 What “preview discovery” does

Preview discovery is a read/attach operation:

1. The frontend asks `apps/web` for the current preview for a thread.
2. `apps/web` authenticates the session and verifies ownership.
3. `apps/web` resolves `sandboxId`.
4. The worker looks up the registered development server for that sandbox.
5. The worker checks whether the process/session is still active.
6. If it is active, the worker calls:

```text
sandbox.getPreviewLink(port)
```

7. The worker returns preview metadata and the URL.
8. `apps/web` returns that metadata to the frontend.
9. The frontend loads the URL in an iframe or opens it in a new browser tab.

If no server is registered or the process is not running, discovery returns a normal “not available” result. It must not call `executeSessionCommand()` or start anything as a side effect.

Example conceptual response:

```json
{
  "status": "running",
  "serverId": "server-...",
  "port": 3000,
  "url": "https://...",
  "command": "bun run dev -- --host 0.0.0.0"
}
```

No-server response:

```json
{
  "status": "not_running"
}
```

Starting response should be a different operation and should report process state rather than pretending that a URL means the server is ready:

```json
{
  "status": "starting",
  "serverId": "server-...",
  "port": 3000
}
```

The frontend can then poll or subscribe to status changes and call preview discovery once the state becomes `running`.

### 6.3 Why preview discovery must not start the server

Combining these operations in a route such as `POST /preview` that starts a process and returns a URL creates several problems:

- Refreshing the preview can start duplicate servers.
- Opening two tabs can create competing processes on the same port.
- A browser page load unexpectedly mutates sandbox state.
- There is no clean distinction between “server is absent” and “server is booting.”
- Stopping and restarting becomes difficult to reason about.
- Failed startup errors are hidden behind URL-generation errors.
- Authorization to view a preview becomes coupled to permission to execute commands.

A preview route should be closer to `GET /preview` or an attach/resolve operation. A start route should be an explicit process-control action with its own authorization and lifecycle response.

### 6.4 Preview URL lifetime and security

Daytona's preview link may contain a token for a private sandbox. The URL should be treated as a secret capability:

- Do not persist it in public thread messages.
- Do not log the full URL.
- Do not put it into durable metadata unless the security model explicitly allows it.
- Prefer returning it only to an authenticated, authorized browser.
- Consider regenerating it when it expires.

The frontend can keep the URL in component state. If the URL expires, it should ask `apps/web` to discover a fresh URL for the same already-running port. That refresh must still not start the server.

The iframe may also require headers or browser settings depending on the preview gateway and the app's `X-Frame-Options`/CSP. If the application refuses framing, the UI should offer `Open preview in new tab`; that is a browser policy issue, not a reason to mix startup with preview discovery.

### 6.5 Port ownership and multiple services

A sandbox may run more than one service. The model should therefore identify a preview by `serverId` and port, not only by thread:

```text
threadId + sandboxId + serverId + port
```

Examples:

- Frontend: port 3000.
- API: port 4000.
- Storybook: port 6006.

The first version can support one designated preview server per thread, but the data model should not make the URL itself the source of truth. The source of truth is the registered process and port; the URL is derived from the current Daytona sandbox state.

---

## 7. How preview and terminal communicate with the backend

### 7.1 Terminal request path

The terminal is a bidirectional stream:

```text
1. Browser loads /app/{threadId}
2. User opens Terminal
3. Browser requests terminal capability from apps/web
4. apps/web checks Better Auth session
5. apps/web loads thread from Postgres
6. apps/web checks thread.userId
7. apps/web resolves sandboxId
8. Browser opens authenticated WebSocket
9. apps/web relays WebSocket frames to sandbox-worker
10. sandbox-worker validates capability
11. sandbox-worker gets Daytona sandbox by sandboxId
12. sandbox-worker creates or reconnects PTY
13. PTY output flows back through the same relay
14. Keyboard input flows in the opposite direction
```

LangGraph and the agent brain are not required for this live terminal path. The terminal is a direct user-to-sandbox capability, although it uses the same sandbox identity.

### 7.2 Preview discovery path

Preview discovery is a short HTTP request:

```text
1. Browser opens Preview tab
2. Browser requests preview status for threadId
3. apps/web checks session and thread ownership
4. apps/web resolves sandboxId
5. apps/web asks sandbox-worker to inspect server registry
6. sandbox-worker checks process/session status
7. sandbox-worker calls Daytona getPreviewLink(port) if running
8. URL and status return to apps/web
9. apps/web returns metadata to browser
10. Browser loads iframe URL directly
```

The iframe request itself does not need to pass through Next.js if Daytona's preview URL is reachable by the browser. It goes directly to the Daytona preview gateway. That keeps application response bytes out of `apps/web`.

If the deployment cannot expose Daytona preview URLs directly to the browser, a later design can add a reverse proxy. That proxy would relay HTTP requests to the preview, but it should still only attach to an already-running port and should not start processes.

### 7.3 Server-start path

Starting a server is explicit and separate:

```text
1. User clicks Start server or agent requests it
2. apps/web authenticates and authorizes process-control
3. apps/web sends a start request to sandbox-worker
4. sandbox-worker gets the Daytona sandbox
5. sandbox-worker checks for an existing server on the requested logical serverId/port
6. If already running, it returns the existing process state
7. Otherwise it creates/uses a persistent Daytona session
8. It runs the configured command asynchronously
9. It records serverId, sessionId, command, port, and status=starting
10. It observes status/logs until the process is running or failed
11. The frontend receives status updates or polls status
12. Once running, the frontend performs preview discovery
```

The start operation should be idempotent. Repeating it for the same `serverId` should return the existing process rather than launching a second process.

---

## 8. Process lifecycle and persistence

### 8.1 Sandbox lifecycle

The Daytona sandbox is the long-lived environment. The repository clone and running processes exist inside it. A worker restart must not cause the design to assume the sandbox disappeared.

The worker should be able to reconstruct state by:

- Looking up the sandbox by `nixx-{sandboxId}`.
- Listing active PTY sessions with `listPtySessions()`.
- Reading registered server metadata from durable storage, if used.
- Checking whether expected ports/processes are still active.

### 8.2 PTY lifecycle

PTY state belongs to the sandbox, not to a particular browser tab. The worker should maintain a mapping such as:

```text
sandboxId + terminalId -> PTY session ID
```

The mapping can be reconstructed from Daytona PTY session IDs if the naming convention is stable.

### 8.3 Server lifecycle

A server process should be represented independently from the preview URL:

```text
serverId
sandboxId
threadId
sessionId
port
command
cwd
status
```

When a preview panel closes, the server should normally remain running. The user needs an explicit Stop action or a sandbox cleanup policy should stop it later.

When a server exits unexpectedly, status should become `failed` or `stopped`, and the next preview discovery should report that state rather than silently restarting it.

### 8.4 Database versus in-memory state

The current `sandbox-worker` uses an in-memory `sandboxRegistry` for cached Daytona objects. That cache is an optimization, not durable state.

For terminal and preview features:

- Daytona remains the source of truth for actual sandbox/process existence.
- A durable store can hold logical metadata and ownership references.
- In-memory maps can hold active WebSocket/PTY relay handles.
- Terminal bytes and preview content should not be stored in Postgres.

If multiple worker instances can serve the same sandbox, sticky routing or a shared relay/session manager may be necessary. A single worker instance per sandbox is simpler because a live `PtyHandle` is connection-oriented.

---

## 9. Frontend layout and responsibilities

The current thread page has a chat column with messages and a composer. The natural layout is a split workspace:

```text
+-------------------------------------------------------------+
| repository / branch / connection status                    |
+------------------------------+------------------------------+
| Chat                         | Workspace panel              |
|                              | [Terminal] [Preview]         |
| messages                     |                              |
|                              | terminal emulator or iframe  |
| composer                     |                              |
+------------------------------+------------------------------+
```

The frontend panel should contain:

- Terminal tab.
- Preview tab.
- Connection/status indicator.
- Start/stop server controls in the Preview tab.
- Port and service selector if multiple services are supported.
- Reconnect button when a stream drops.
- Open-in-new-tab action for iframe restrictions.

The chat's existing LangGraph `useStream` remains separate. Agent messages and tool calls continue through the existing SSE route. Terminal data should not be inserted into the LangGraph message stream because it is user workspace I/O, not an agent message.

The frontend therefore has three independent channels:

```text
Agent conversation:  LangGraph SSE
Interactive terminal: WebSocket
Preview page:        iframe/browser -> Daytona preview URL
```

Keeping these channels separate prevents terminal bytes, browser refreshes, and preview navigation from corrupting the agent event stream.

---

## 10. Failure and reconnection behavior

### Terminal failures

- Worker unavailable: show `Terminal unavailable` and allow retry.
- Sandbox missing: show `Sandbox is not provisioned`.
- PTY missing after reconnect: create a new PTY only if the user explicitly accepts a new session, or show that the old session ended.
- WebSocket disconnect: reconnect with backoff; do not automatically kill the PTY.
- PTY exit: show exit status and disable input until a new session is created.

### Preview failures

- No server registered: show `No running preview`; do not start one.
- Server starting: show status and logs/status polling.
- Server failed: show the process failure and offer explicit restart.
- Preview token expired: request a fresh URL and reload the iframe.
- Server stopped: show `Preview stopped`.
- App rejects iframe: offer opening in a new tab.

### Authorization failures

A thread ownership failure should be returned as unauthorized/not found according to the existing thread API policy. The worker should not reveal whether another user's sandbox exists.

---

## 11. Recommended API shape

The exact route names can change, but the responsibilities should stay separate.

### Terminal control and connection

```text
POST /api/threads/{threadId}/terminal/capability
```

Returns a short-lived capability or connection details after session and ownership checks.

```text
WebSocket /api/threads/{threadId}/terminal
```

Carries raw PTY input/output and JSON control frames. The WebSocket handler must perform authorization before relaying traffic.

```text
POST /api/threads/{threadId}/terminal/resize
```

This is optional if resize travels over the WebSocket. It should not be added solely for convenience if the live socket already carries resize frames.

### Server process control

```text
POST /api/threads/{threadId}/servers
```

Explicitly starts a named server process. It returns `starting`, `running`, or an existing server record. It does not need to return a preview URL.

```text
POST /api/threads/{threadId}/servers/{serverId}/stop
```

Explicitly stops a server process/session.

```text
GET /api/threads/{threadId}/servers
```

Lists registered server metadata and current status. This is discovery/status, not startup.

### Preview discovery

```text
GET /api/threads/{threadId}/servers/{serverId}/preview
```

Checks that the server is running, calls Daytona `getPreviewLink(port)`, and returns a fresh preview URL. If the server is not running, it returns status without starting anything.

The distinction is intentional:

```text
POST /servers                  = mutate process state
GET /servers                   = inspect process state
GET /servers/{id}/preview      = derive an access URL for a running process
```

The `GET` preview operation should be safe to repeat.

---

## 12. Security considerations

1. **Thread ownership must be checked on every operation.** Do not trust a thread ID or sandbox ID supplied by the client.
2. **Keep Daytona credentials in the worker.** They must never cross into browser code or be returned in API responses.
3. **Treat preview URLs as bearer capabilities.** Avoid logging and durable public storage.
4. **Use short-lived capabilities for WebSocket connections.** A capability should be scoped to one sandbox and operation set.
5. **Separate viewing from process control.** A user who can view a preview should not automatically gain permission to start arbitrary commands unless that is intentional.
6. **Do not accept arbitrary shell commands from a public terminal API without the existing sandbox authorization boundary.** The terminal is powerful by design and must be restricted to the owning authenticated thread.
7. **Validate ports and server definitions.** Do not allow a client to use the preview mechanism to reach arbitrary internal network destinations.
8. **Use stable server IDs controlled by the backend.** Do not use raw URLs as identifiers.
9. **Bound WebSocket message sizes and connection counts.** This protects the worker from accidental or abusive resource use.
10. **Do not expose Redis or Daytona management endpoints to the browser.** Only the narrowly scoped worker gateway should be reachable.

---

## 13. Suggested implementation order

This is the order I would use when implementation begins:

1. Define shared server, PTY, capability, and status contracts.
2. Add an internal worker gateway with authentication and thread/sandbox scoping.
3. Add Daytona server-session lifecycle management with idempotent start/stop/status operations.
4. Add preview discovery using `getPreviewLink(port)` with no startup side effect.
5. Add terminal PTY creation, reconnect, input, output, resize, and cleanup.
6. Add authenticated Next.js API/WebSocket proxy behavior.
7. Add the frontend split workspace with Terminal and Preview tabs.
8. Add reconnection, expired-preview refresh, process failure, and sandbox-missing states.
9. Add integration tests covering ownership, idempotent server start, no-side-effect preview discovery, PTY reconnect, and preview URL refresh.

The most important test is:

```text
Calling preview discovery repeatedly must never create or restart a server.
```

That invariant keeps the browser panel predictable and makes process lifecycle explicit.
