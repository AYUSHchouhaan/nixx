# Result Consumer and Pending Calls

This document explains how `apps/agent-brain/src/result-consumer.ts` and `apps/agent-brain/src/pending-calls.ts` implement the asynchronous request/response bridge between the LangGraph agent and the sandbox worker.

## 1. The Problem They Solve

The agent sends work to the sandbox worker through BullMQ and Redis. The worker processes the work in another process and sends a response later.

The agent still wants to write code that looks synchronous:

```ts
const result = await sandboxClient.call(input);
```

The pending-call registry makes this possible. It stores the Promise callbacks using a unique `commandId`. When the response arrives, the result consumer uses the same ID to resume the correct Promise.

```text
agent graph
    |
    | await sandboxClient.call(...)
    v
agent-to-sandbox queue
    |
    v
sandbox worker
    |
    | result message with the same commandId
    v
sandbox-to-agent queue
    |
    v
result-consumer
    |
    v
pending-calls map
    |
    v
original Promise resolves or rejects
```

The `commandId` is the correlation ID. It connects one outgoing message to one incoming response.

## 2. The Shared Message Types

The message types are defined in `packages/contracts/src/messages.ts`.

A normal command sent from agent-brain to the sandbox worker has this shape:

```ts
{
  type: "command",
  commandId: string,
  threadId: string,
  conversationId: string,
  sandboxId: string,
  command: SandboxCommandName,
  args: Record<string, unknown>,
}
```

The response has this shape:

```ts
{
  type: "result",
  commandId: string,
  threadId: string,
  conversationId: string,
  sandboxId: string,
  output: string,
  exitCode: number,
  error?: string,
}
```

Provisioning uses a separate message shape:

```ts
{
  type: "provision",
  commandId: string,
  threadId: string,
  conversationId: string,
  sandboxId: string,
  repoUrl: string,
  branch?: string,
  installationToken: string,
}
```

Its response is:

```ts
{
  type: "provision_result",
  commandId: string,
  sandboxId: string,
  sandboxPath: string,
  cloned: boolean,
  error?: string,
}
```

Both request types have a `commandId`, even though provisioning is not a normal sandbox command. This lets both operations use the same correlation pattern.

## 3. `pending-calls.ts`

### The `PendingCall<T>` type

```ts
type PendingCall<T> = {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
```

`T` is a generic type parameter representing the result expected by the Promise.

For a normal command:

```ts
PendingCall<SandboxCallResult>
```

For provisioning:

```ts
PendingCall<SandboxProvisionResult>
```

The stored fields are the functions supplied by the Promise constructor and the timeout handle:

- `resolve` completes the Promise successfully.
- `reject` completes the Promise with an error.
- `timer` is cleared when the response arrives.

### The two registries

```ts
const commandCalls = new Map<string, PendingCall<SandboxCallResult>>();
const provisionCalls = new Map<string, PendingCall<SandboxProvisionResult>>();
```

Each map has this conceptual structure:

```text
commandId -> { resolve, reject, timer }
```

There are two maps because normal commands and provisioning return different result types.

### Registering a pending operation

```ts
function register<T>(
  map: Map<string, PendingCall<T>>,
  commandId: string,
  call: PendingCall<T>,
) {
  map.set(commandId, call);
}
```

`map.set(...)` stores the Promise callbacks under the correlation ID.

A real entry looks like this conceptually:

```text
commandCalls["abc-123"] = {
  resolve: Promise resolve function,
  reject: Promise reject function,
  timer: timeout handle,
}
```

### Resolving a pending operation

```ts
function resolve<T>(
  map: Map<string, PendingCall<T>>,
  commandId: string,
  result: T,
): boolean {
  const call = map.get(commandId);
  if (!call) return false;
  map.delete(commandId);
  clearTimeout(call.timer);
  call.resolve(result);
  return true;
}
```

The function performs four steps:

1. Find the callbacks using `commandId`.
2. Return `false` if no matching request exists.
3. Delete the completed request and cancel its timeout.
4. Call the stored `resolve` function with the result.

Deleting the map entry prevents a memory leak and prevents a duplicate response from being processed again.

### Rejecting a pending operation

```ts
function reject<T>(
  map: Map<string, PendingCall<T>>,
  commandId: string,
  reason: Error,
): boolean {
  const call = map.get(commandId);
  if (!call) return false;
  map.delete(commandId);
  clearTimeout(call.timer);
  call.reject(reason);
  return true;
}
```

This follows the same cleanup process as `resolve`, but calls `reject` instead. The original `await` then throws the supplied error.

### Public wrapper functions

The exported functions select the correct map and result type:

```ts
registerPendingCall(commandId, call);
resolvePendingCall(commandId, result);
rejectPendingCall(commandId, error);
```

These operate on `commandCalls`.

```ts
registerPendingProvision(commandId, call);
resolvePendingProvision(commandId, result);
rejectPendingProvision(commandId, error);
```

These operate on `provisionCalls`.

The rest of agent-brain does not need direct access to either map.

## 4. How `BullMqSandboxClient.call` Creates a Pending Call

The normal command path is implemented in `apps/agent-brain/src/bullmq-sandbox-client.ts`.

A caller provides:

```ts
await sandboxClient.call({
  threadId: "thread-1",
  conversationId: "conversation-1",
  sandboxId: "sandbox-1",
  command: "run_command",
  args: {
    command: "npm test",
  },
});
```

The client generates an ID:

```ts
const commandId = randomUUID();
```

For example:

```text
commandId = "abc-123"
```

It then creates the outgoing message:

```ts
const message: SandboxCommandMessage = {
  type: "command",
  commandId,
  ...input,
};
```

The resulting message is approximately:

```json
{
  "type": "command",
  "commandId": "abc-123",
  "threadId": "thread-1",
  "conversationId": "conversation-1",
  "sandboxId": "sandbox-1",
  "command": "run_command",
  "args": {
    "command": "npm test"
  }
}
```

Then it creates a Promise:

```ts
return new Promise<SandboxCallResult>((resolve, reject) => {
  const timer = setTimeout(() => {
    rejectPendingCall(
      commandId,
      new Error(`Sandbox timeout for command ${commandId}`),
    );
  }, CALL_TIMEOUT_MS);

  registerPendingCall(commandId, { resolve, reject, timer });

  void agentToSandboxQueue.add("command", message).catch((err) => {
    rejectPendingCall(commandId, err);
  });
});
```

The Promise does not resolve immediately. Its callbacks are stored in `commandCalls`, and the message is placed on the Redis queue.

The timeout is currently 120 seconds:

```ts
const CALL_TIMEOUT_MS = 120_000;
```

There are three possible outcomes:

```text
queue succeeds and worker responds
    -> resolvePendingCall(...)

queue insertion fails
    -> rejectPendingCall(...)

no response for 120 seconds
    -> rejectPendingCall(...)
```

## 5. What the Sandbox Worker Does

The sandbox worker listens to the `agent-to-sandbox` queue in `apps/sandbox-worker/src/main.ts`.

For a normal command, it executes:

```ts
const result = await executeSandboxCommand(
  sandboxPath,
  data.command,
  data.args,
);
```

For example, the executor may return:

```ts
{
  output: "Tests passed",
  exitCode: 0,
}
```

The worker creates a response while preserving the original ID:

```ts
const message: SandboxResultMessage = {
  type: "result",
  commandId: data.commandId,
  threadId: data.threadId,
  conversationId: data.conversationId,
  sandboxId: data.sandboxId,
  output: result.output,
  exitCode: result.exitCode,
  error: result.error,
};
```

It publishes that response to the other queue:

```ts
await sandboxToAgentQueue.add("result", message);
```

The important property is:

```text
outgoing commandId === incoming result commandId
```

## 6. `result-consumer.ts`

The result consumer listens to the `sandbox-to-agent` queue. It is started when agent-brain loads `apps/agent-brain/src/graph.ts`:

```ts
startResultConsumer();
```

The consumer creates a BullMQ Worker:

```ts
const worker = new Worker(
  QUEUE_NAMES.sandboxToAgent,
  async (job) => {
    const data = job.data as
      | SandboxResultMessage
      | SandboxProvisionResultMessage;
```

The `as` syntax is a TypeScript type assertion. It tells TypeScript that the job data is expected to be one of the two known response message types. It does not validate the data at runtime.

### Routing a provisioning response

```ts
if (data.type === "provision_result") {
  resolvePendingProvision(data.commandId, {
    sandboxId: data.sandboxId,
    sandboxPath: data.sandboxPath,
    cloned: data.cloned,
    error: data.error,
  });
  return;
}
```

The `data.type` check is a discriminant check. Because `type` is either `"result"` or `"provision_result"`, TypeScript narrows `data` to the provisioning message inside this block.

The `return` is important because it prevents a provisioning response from falling through into the normal command path.

### Routing a normal command response

If the response is not a provisioning response, the consumer resolves the normal command map:

```ts
resolvePendingCall(data.commandId, {
  output: data.output,
  exitCode: data.exitCode,
  error: data.error,
});
```

For the example ID, this becomes conceptually:

```ts
resolvePendingCall("abc-123", {
  output: "Tests passed",
  exitCode: 0,
});
```

`pending-calls.ts` finds the matching entry, removes it, clears the timeout, and calls the stored `resolve` function. The original graph code then continues after its `await`:

```ts
const result = await sandboxClient.call(input);

console.log(result.output);
// Tests passed
```

## 7. Failure Handling

There are three main failure paths.

### Queue insertion failure

If Redis or BullMQ cannot add the outgoing message, the queue Promise rejects:

```ts
void agentToSandboxQueue.add("command", message).catch((err) => {
  rejectPendingCall(commandId, err);
});
```

The matching pending entry is rejected and deleted.

### Worker job failure

The result consumer listens for failed BullMQ jobs:

```ts
worker.on("failed", (job, err) => {
  const data = job?.data as
    | SandboxResultMessage
    | SandboxProvisionResultMessage
    | undefined;

  if (!data?.commandId) return;

  if (data.type === "provision_result") {
    rejectPendingProvision(data.commandId, err);
    return;
  }

  rejectPendingCall(data.commandId, err);
});
```

The worker error is routed to the correct map using the same `commandId`.

### Timeout

If no response arrives within 120 seconds, the timeout callback rejects the Promise:

```ts
rejectPendingCall(
  commandId,
  new Error(`Sandbox timeout for command ${commandId}`),
);
```

The rejection function deletes the map entry and clears the timer. A late response for that ID is ignored because the entry no longer exists.

## 8. Provisioning Flow

Provisioning uses the same pattern, but it uses `provisionCalls` because it returns `SandboxProvisionResult` rather than `SandboxCallResult`.

The graph requests provisioning:

```ts
await sandboxClient.provision({
  threadId,
  conversationId,
  sandboxId,
  repoUrl,
  branch,
  installationToken,
});
```

The client then:

1. Generates a `commandId`.
2. Builds a `SandboxProvisionMessage` with `type: "provision"`.
3. Stores the Promise callbacks in `provisionCalls`.
4. Sends the message to `agent-to-sandbox`.

The sandbox worker clones and configures the repository, then publishes a response such as:

```json
{
  "type": "provision_result",
  "commandId": "abc-123",
  "sandboxId": "sandbox-1",
  "sandboxPath": "D:\\sandboxes\\sandbox-1",
  "cloned": true
}
```

The result consumer detects `data.type === "provision_result"` and calls:

```ts
resolvePendingProvision(data.commandId, {
  sandboxId: data.sandboxId,
  sandboxPath: data.sandboxPath,
  cloned: data.cloned,
  error: data.error,
});
```

That resolves the original `await sandboxClient.provision(...)` call.

## 9. Multiple Requests at Once

Several commands can be waiting at the same time:

```text
commandCalls:
  "id-1" -> Promise for read_file
  "id-2" -> Promise for run_command
  "id-3" -> Promise for edit_file
```

Responses do not need to arrive in the same order as requests. Each response carries its own ID:

```text
response for "id-2" -> resolves the run_command Promise
response for "id-1" -> resolves the read_file Promise
response for "id-3" -> resolves the edit_file Promise
```

This is why matching by queue order would be incorrect. The implementation matches by `commandId` instead.

## 10. Important Runtime Limitation

The pending registries are ordinary in-memory Maps:

```ts
const commandCalls = new Map(...);
const provisionCalls = new Map(...);
```

They are not persisted in Redis or Postgres. If the agent-brain process restarts while a request is pending:

- the queue message may still exist,
- the Promise callbacks are lost,
- the response has no matching map entry,
- `resolvePendingCall(...)` or `resolvePendingProvision(...)` returns `false`.

The current design therefore requires the same agent-brain process to remain alive until each sandbox operation finishes.

## 11. One Complete Example

```text
1. Graph calls sandboxClient.call({ command: "run_command", ... }).
2. Client creates commandId = "abc-123".
3. Client stores { resolve, reject, timer } at commandCalls["abc-123"].
4. Client sends a command message to agent-to-sandbox.
5. Sandbox worker receives the message and runs the command.
6. Worker sends a result message with commandId = "abc-123".
7. Result consumer receives the result from sandbox-to-agent.
8. Result consumer calls resolvePendingCall("abc-123", result).
9. Registry deletes the entry and clears its timeout.
10. The original await expression receives the result.
```

The entire request/response relationship depends on preserving the same `commandId` from the outgoing message through the worker response.