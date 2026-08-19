# Sandbox Clone & Reuse — Implementation Reference

This document describes the sandbox provisioning work that was added on top of the existing agent ↔ sandbox architecture. It covers how a repository is cloned into a sandbox on the first agent run, how that same sandbox is reused on subsequent runs, and how the GitHub installation token flows through the backend into the clone step.

## 1. Problem being solved

Before this change, every agent run used a fallback sandbox id (`thread.sandboxId ?? threadId`) but there was no provisioning step. The sandbox worker only executed read/glob/grep/run commands against a local directory root, with no guarantee that the repository existed there.

The goals of the change:

- When the agent is asked to run, create a sandbox and clone the repository the user requested.
- Pass the GitHub installation token from the backend through to the agent request.
- Use the installation token (via an `x-access-token` auth header, which is the same mechanism Octokit uses) to clone private repositories.
- Check whether the sandbox already exists before cloning.
- On the second, third, or any later run, reuse the existing sandbox and run only the agent loop instead of creating a new sandbox and cloning again.

## 2. End-to-end flow

```text
┌─────────────────────────────────────────────────────────────────────┐
│ web (Next.js)                                                        │
│ POST /api/threads/:threadId/run                                      │
│  1. resolve session                                                   │
│  2. load thread + verify ownership                                    │
│  3. get GitHub installation token (getInstallationToken)             │
│  4. call runAgent({ repoUrl, branch, installationToken, ... })       │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ @langchain/langgraph-sdk
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ agent-brain (LangGraph server)                                       │
│  config.configurable carries:                                        │
│    thread_id, conversation_id, sandbox_id,                           │
│    repo_url, branch, installation_token                              │
│  graph starts at prepare-sandbox                                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ deps.sandboxClient.provision(...)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BullMqSandboxClient                                                  │
│  pushes a "provision" job onto agent-to-sandbox                      │
│  awaits a "provision_result" on sandbox-to-agent                     │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ BullMQ / Redis
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ sandbox-worker                                                       │
│  provisionSandbox()                                                  │
│    if <SANDBOX_ROOT>/<sandboxId>/.git exists -> reuse (no clone)      │
│    else clone repo with installation token auth                      │
│  publishes provision_result back to agent-brain                      │
└─────────────────────────────────────────────────────────────────────┘
```

On later runs, the `prepare-sandbox` node still runs, but `provisionSandbox` detects the existing `.git` directory and returns immediately without cloning. The graph then continues into the normal agent loop.

## 3. Package-by-package changes

### 3.1 `@repo/contracts`

New message shapes in `packages/contracts/src/messages.ts`.

```ts
export interface SandboxProvisionInput {
  threadId: string;
  conversationId: string;
  sandboxId: string;
  repoUrl: string;
  branch?: string;
  installationToken: string;
}

export interface SandboxProvisionResult {
  sandboxId: string;
  sandboxPath: string;
  cloned: boolean;
  error?: string;
}

export interface SandboxProvisionMessage extends SandboxProvisionInput {
  type: "provision";
  commandId: string;
}

export interface SandboxProvisionResultMessage
  extends SandboxProvisionResult {
  type: "provision_result";
  commandId: string;
}
```

The `SandboxClient` interface now requires both a normal `call()` and a `provision()` method:

```ts
export interface SandboxClient {
  call(input: SandboxCallInput): Promise<SandboxCallResult>;
  provision(input: SandboxProvisionInput): Promise<SandboxProvisionResult>;
}
```

### 3.2 `apps/sandbox-worker`

Two files were changed here.

`apps/sandbox-worker/src/provision.ts` is new and contains the clone logic.

Key functions:

```ts
export function resolveSandboxPath(baseRoot: string, sandboxId: string): string {
  return path.join(baseRoot, sandboxId);
}

export async function sandboxExists(sandboxPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(sandboxPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function provisionSandbox(
  baseRoot: string,
  input: {
    sandboxId: string;
    repoUrl: string;
    branch?: string;
    installationToken: string;
  },
): Promise<SandboxProvisionResult> {
  const sandboxPath = resolveSandboxPath(baseRoot, input.sandboxId);

  if (!isGithubHttpsUrl(input.repoUrl)) {
    return {
      sandboxId: input.sandboxId,
      sandboxPath,
      cloned: false,
      error: "Only https://github.com repository URLs are allowed",
    };
  }

  if (await sandboxExists(sandboxPath)) {
    return {
      sandboxId: input.sandboxId,
      sandboxPath,
      cloned: false,
    };
  }

  await fs.mkdir(sandboxPath, { recursive: true });

  const auth = Buffer.from(
    `x-access-token:${input.installationToken}`,
  ).toString("base64");

  const cloneArgs = [
    "-c",
    `http.extraheader=AUTHORIZATION: basic ${auth}`,
    "clone",
    "--depth",
    "1",
    ...(input.branch ? ["--branch", input.branch] : []),
    input.repoUrl,
    ".",
  ];

  const result = await runGit(cloneArgs, sandboxPath);

  if (result.exitCode !== 0) {
    return {
      sandboxId: input.sandboxId,
      sandboxPath,
      cloned: false,
      error: result.error ?? result.output,
    };
  }

  return {
    sandboxId: input.sandboxId,
    sandboxPath,
    cloned: true,
  };
}
```

Behavior details:

- Only `https://github.com` URLs are accepted, which prevents arbitrary `git` URLs from being passed through.
- The installation token is sent as `x-access-token:<token>`, base64-encoded into a `basic` authorization header. This is exactly what GitHub Apps/Octokit use for installation tokens.
- `--depth 1` performs a shallow clone.
- If `branch` is provided, `--branch <branch>` is appended.
- The clone runs inside the sandbox directory with `.` as the destination, so the repo contents land directly in `<SANDBOX_ROOT>/<sandboxId>`.
- Reuse is checked by looking for `<sandboxId>/.git` before cloning.

`apps/sandbox-worker/src/main.ts` now handles both command and provision jobs:

```ts
const worker = new Worker(
  QUEUE_NAMES.agentToSandbox,
  async (job) => {
    const data = job.data as SandboxCommandMessage | SandboxProvisionMessage;

    if (data.type === "provision") {
      const result = await provisionSandbox(sandboxRoot, {
        sandboxId: data.sandboxId,
        repoUrl: data.repoUrl,
        branch: data.branch,
        installationToken: data.installationToken,
      });

      const message: SandboxProvisionResultMessage = {
        type: "provision_result",
        commandId: data.commandId,
        ...result,
      };

      await sandboxToAgentQueue.add("provision_result", message);
      return;
    }

    const sandboxPath = resolveSandboxPath(sandboxRoot, data.sandboxId);
    const result = await executeSandboxCommand(
      sandboxPath,
      data.command,
      data.args,
    );

    // ... publish result
  },
  { connection: redisConnection },
);
```

Important: regular commands now run inside `<SANDBOX_ROOT>/<sandboxId>` instead of the flat `SANDBOX_ROOT`. This keeps each sandbox isolated by its `sandboxId`.

### 3.3 `apps/agent-brain`

The BullMQ-backed sandbox client now implements both `call` and `provision`.

`apps/agent-brain/src/bullmq-sandbox-client.ts`:

```ts
export class BullMqSandboxClient implements SandboxClient {
  async call(input: SandboxCallInput): Promise<SandboxCallResult> {
    // pushes a "command" job and awaits the matching result
  }

  async provision(input: SandboxProvisionInput): Promise<SandboxProvisionResult> {
    const commandId = randomUUID();

    const message: SandboxProvisionMessage = {
      type: "provision",
      commandId,
      ...input,
    };

    return new Promise<SandboxProvisionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        rejectPendingProvision(
          commandId,
          new Error(`Sandbox provision timeout for command ${commandId}`),
        );
      }, CALL_TIMEOUT_MS);

      registerPendingProvision(commandId, { resolve, reject, timer });

      void agentToSandboxQueue.add("provision", message).catch((err) => {
        rejectPendingProvision(commandId, err);
      });
    });
  }
}
```

The pending-call registry (`apps/agent-brain/src/pending-calls.ts`) now has separate maps for command calls and provision calls:

```ts
const commandCalls = new Map<string, PendingCall<SandboxCallResult>>();
const provisionCalls = new Map<string, PendingCall<SandboxProvisionResult>>();
```

This prevents command and provision result types from being mixed up.

The result consumer (`apps/agent-brain/src/result-consumer.ts`) distinguishes the two result types by the message's `type` field:

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

resolvePendingCall(data.commandId, {
  output: data.output,
  exitCode: data.exitCode,
  error: data.error,
});
```

### 3.4 `@repo/agent`

A new graph node, `prepare-sandbox`, runs before `generate-action`.

`packages/agent/programmer/nodes/prepare-sandbox.ts`:

```ts
export async function prepareSandboxNode(
  state: ProgrammerState,
  deps: ProgrammerGraphDeps,
  config: RunnableConfig,
): Promise<Partial<ProgrammerState>> {
  const threadId = getConfigurableString(config, "thread_id");
  const conversationId = getConfigurableString(config, "conversation_id");
  const sandboxId = getConfigurableString(config, "sandbox_id");
  const repoUrl = getConfigurableString(config, "repo_url");
  const installationToken = getConfigurableString(config, "installation_token");

  const branchValue = config.configurable?.branch;
  const branch =
    typeof branchValue === "string" && branchValue ? branchValue : undefined;

  const result = await deps.sandboxClient.provision({
    threadId,
    conversationId,
    sandboxId,
    repoUrl,
    branch,
    installationToken,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  return {};
}
```

The graph wiring changed from `START -> generate-action` to:

```text
START -> prepare-sandbox -> generate-action
```

This means every run performs the existence check first. If the sandbox already exists, provisioning is a no-op and the agent loop proceeds.

### 3.5 `apps/web`

The run route now requires the repository URL and passes the installation token.

`apps/web/app/api/threads/[threadId]/run/route.ts`:

```ts
const body = (await request.json()) as {
  query: string;
  notes?: string;
  repoUrl?: string;
  branch?: string;
};

if (!body.query) {
  return NextResponse.json({ error: "query is required" }, { status: 400 });
}

if (!body.repoUrl) {
  return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
}
```

Then it fetches the installation token and forwards everything to `runAgent`:

```ts
const { token: installationToken } = await getInstallationToken(
  session.user.id,
);

const { summary } = await runAgent({
  threadId,
  conversationId: thread.conversationId,
  sandboxId,
  query: body.query,
  notes: body.notes,
  repoUrl: body.repoUrl,
  branch: body.branch,
  installationToken,
});
```

`apps/web/app/lib/agent-brain.ts` passes these values into the LangGraph run config:

```ts
config: {
  configurable: {
    thread_id: input.threadId,
    conversation_id: input.conversationId,
    sandbox_id: input.sandboxId,
    repo_url: input.repoUrl,
    branch: input.branch,
    installation_token: input.installationToken,
  },
},
```

### 3.6 `@repo/db`

The existing `getInstallationToken` helper imports `accounts` from `@repo/db/schema`, but the canonical schema only exported `users`, `conversations`, and `threads`. This caused a type error in the web app once the run route started depending on that helper.

The schema was updated to include the Better Auth tables that already existed in the migrations:

- `accounts`
- `sessions`
- `verifications`

They were also added to the exported `schema` object so Better Auth's Drizzle adapter can use them.

## 4. Sandbox identity and reuse

Sandbox identity is determined by `sandboxId`. The current run route still computes it as:

```ts
const sandboxId = thread.sandboxId ?? threadId;
```

Because the provision step stores the cloned repo at `<SANDBOX_ROOT>/<sandboxId>`, reusing the same `sandboxId` is what makes the second and third requests avoid a new clone.

The clone/existence check lives in the sandbox worker, so the agent graph itself does not need to know where files live. It only calls `provision()` and then continues with `read`, `glob`, `grep`, and `run` against that sandbox id.

## 5. Security notes

- The installation token is passed through `config.configurable`, not baked into the graph constructor.
- The token is used only for the `git clone` auth header.
- Only HTTPS GitHub URLs are allowed for cloning.
- The token is not stored in the sandbox directory and is not written to disk.
- Ownership is still enforced on the run route by comparing `thread.userId` to `session.user.id`.

## 6. API changes

### `POST /api/threads/:threadId/run`

Request body is now:

```json
{
  "query": "Implement ...",
  "notes": "optional context",
  "repoUrl": "https://github.com/owner/repo",
  "branch": "optional-branch"
}
```

`repoUrl` is required. `branch` is optional.

## 7. Environment variables

No new environment variables are required for the clone logic. The existing ones still apply:

| App | Variable | Default |
|---|---|---|
| agent-brain | `DATABASE_URL` | required |
| agent-brain | `REDIS_HOST` | `localhost` |
| agent-brain | `REDIS_PORT` | `6379` |
| sandbox-worker | `SANDBOX_ROOT` | `process.cwd()` |
| sandbox-worker | `REDIS_HOST` | `localhost` |
| sandbox-worker | `REDIS_PORT` | `6379` |
| web | `AGENT_BRAIN_URL` | `http://localhost:4000` |
| web | `GITHUB_APP_ID` | required for installation token |
| web | `GITHUB_PRIVATE_KEY` | required for installation token |

The `SANDBOX_ROOT` should point to a persistent directory where cloned repositories should live. If it is not set, the sandbox worker's current working directory is used.

## 8. Running the system

```powershell
# install
bun install

# start Redis, then run these in separate terminals:

# 1. sandbox worker
bun run dev --filter=sandbox-worker

# 2. agent brain
bun run dev --filter=agent-brain

# 3. web (primary backend)
bun run dev --filter=web
```

Manual run request example:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/threads/<threadId>/run" `
  -ContentType "application/json" `
  -Body '{"query":"...","repoUrl":"https://github.com/owner/repo"}'
```

## 9. Typechecking

All touched packages pass:

```powershell
bun run check-types --filter=@repo/contracts
bun run check-types --filter=@repo/agent
bun run check-types --filter=sandbox-worker
bun run check-types --filter=agent-brain
bun run check-types --filter=web
```

## 10. Remaining notes

- The web route now requires `repoUrl`. The frontend must send it or the endpoint returns `400`.
- File modification tools (`write_file`, `edit`) remain deferred and are not part of this change.
- The sandbox is a local directory clone; there is no container isolation yet.
