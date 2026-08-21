# PR Flow — Implementation Reference

This document describes the pull request flow added to the agent graph. It covers the two new graph nodes, the PR state field, the sandbox `git` command, and the GitHub API calls that create and open a PR.

## 1. What this feature does

When the agent runs:

1. It provisions/clones the sandbox as before.
2. It creates an empty PR immediately after sandbox provisioning:
   - creates a branch named `nixx/{threadId}` from the repository default branch,
   - opens an empty GitHub PR on that branch,
   - checks out the branch in the sandbox,
   - pushes an empty commit so the branch and PR are actually live.
3. It stores the PR number and HTML URL in the graph state so later steps can reuse them.
4. It runs the normal agent loop.
5. When the agent finishes (`mark_task_complete` or final response), it opens the PR:
   - checks out `nixx/{threadId}`,
   - stages all changes except build/generated directories,
   - commits the changes,
   - pushes them to the existing PR branch.

The PR link is held in `state.pullRequest.htmlUrl`. Passing it to the frontend is intentionally deferred for later.

## 2. End-to-end flow

```text
START
  -> prepare-sandbox
  -> create-empty-pr   (create branch + empty PR + empty commit + store PR in state)
  -> generate-action
       -> take-action  (loop)
  -> open-pull-request (checkout branch + git add + commit + push)
  -> end-conclusion
  -> END
```

## 3. File-by-file changes

### `packages/contracts/src/messages.ts`

Added `git` to the sandbox command map.

```ts
export const SANDBOX_COMMANDS = {
  // ...
  editFile: "edit_file",
  git: "git",
} as const;
```

This makes `git` a valid `SandboxCommandName` so the agent can issue git operations to the sandbox worker.

### `apps/sandbox-worker/src/executor.ts`

Added the `git` command to the local `SandboxCommandName` union and added a `runGit` helper plus a `git` case in `executeSandboxCommand`.

```ts
async function runGit(root: string, args: string[]) {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd: root, windowsHide: true });
    // collects stdout/stderr and resolves on exit
  });
}
```

```ts
case "git":
  return runGit(root, (args.args as string[]) ?? []);
```

The `git` command executes `git <args...>` inside the sandbox repository directory.

### `apps/sandbox-worker/src/provision.ts`

After a successful clone, the sandbox git repository is configured with:

- `http.extraheader` using the GitHub installation token (base64 basic auth),
- a commit identity (`user.name`, `user.email`),
- `commit.gpgsign` disabled.

```ts
const auth = Buffer.from(`x-access-token:${input.installationToken}`).toString("base64");

const configResults = await Promise.all([
  runGit(["config", "http.extraheader", `AUTHORIZATION: basic ${auth}`], sandboxPath),
  runGit(["config", "user.name", "Nixx"], sandboxPath),
  runGit(["config", "user.email", "noreply@nixx.dev"], sandboxPath),
  runGit(["config", "commit.gpgsign", "false"], sandboxPath),
]);
```

This ensures later branch pushes and commits work with the installation token and a valid git identity.

### `packages/agent/programmer/types.ts`

Added `pullRequest` to `ProgrammerStateAnnotation`.

```ts
pullRequest: Annotation<{ number: number; htmlUrl: string } | null>({
  reducer: (_, update) => update,
  default: () => null,
}),
```

This is the state field that carries the PR number and URL from `create-empty-pr` to `open-pull-request`.

### `packages/agent/programmer/lib/config.ts` (new)

Added a shared `getConfigurableString` helper to read required string values from the LangGraph run config.

```ts
export function getConfigurableString(config: RunnableConfig, name: string): string {
  const value = config.configurable?.[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing configurable.${name}`);
  }
  return value;
}
```

### `packages/agent/programmer/lib/github.ts` (new)

Added `createEmptyPullRequest`. This function:

1. Parses the `repoUrl` into `owner` and `repo`.
2. Fetches the repository to get the default branch.
3. Resolves the base branch SHA.
4. Creates `refs/heads/nixx/{threadId}`.
5. Creates the empty PR against the base branch.
6. Returns `{ number, htmlUrl, branchName }`.

The API calls use the GitHub installation token via `Authorization: Bearer <token>`.

### `packages/agent/programmer/lib/sandbox-git.ts` (new)

Added sandbox git helpers used by the PR nodes:

- `checkoutBranch` — `git fetch origin <branch>` then `git checkout <branch>`.
- `pushEmptyCommit` — `git commit --allow-empty` then `git push origin <branch>`.
- `stageAllFiles` — `git add -A` with excludes for `node_modules`, `.git`, `.next`, `dist`, `build`, and `.turbo`.
- `commitChanges` — `git commit -m <message>`.
- `pushBranch` — `git push origin <branch>`.

Each helper calls the sandbox worker through `sandboxClient.call` with `command: "git"`.

### `packages/agent/programmer/nodes/create-empty-pr.ts` (new)

Added the `createEmptyPrNode` graph node. It:

1. Reads `thread_id`, `repo_url`, and `installation_token` from config.
2. Calls `createEmptyPullRequest`.
3. Checks out the new branch in the sandbox.
4. Pushes an empty commit.
5. Returns `{ pullRequest: { number, htmlUrl } }`.

### `packages/agent/programmer/nodes/open-pull-request.ts` (new)

Added the `openPullRequestNode` graph node. It:

1. Recomputes `branchName` from `thread_id`.
2. Verifies `state.pullRequest` exists.
3. Checks out the PR branch.
4. Stages all allowed files.
5. Commits with `feat: nixx changes for {threadId}`.
6. Pushes to the existing PR branch.

It returns the same PR metadata so it remains in state.

### `packages/agent/programmer/nodes/index.ts`

Exported the two new nodes.

```ts
export { createEmptyPrNode } from "./create-empty-pr";
export { openPullRequestNode } from "./open-pull-request";
```

### `packages/agent/programmer/graph.ts`

Updated the graph wiring and routing:

- Added `create-empty-pr` and `open-pull-request` nodes.
- `prepare-sandbox -> create-empty-pr -> generate-action`.
- `generate-action` now routes to `open-pull-request` when `mark_task_complete` fires or when there is no tool call.
- `open-pull-request -> end-conclusion -> END`.

```ts
function routeAfterGenerateAction(state: ProgrammerState): string {
  // ...
  if (toolName === "mark_task_complete") {
    return "open-pull-request";
  }
  // ...
  return "open-pull-request";
}
```

## 4. PR state handoff

The empty PR node stores:

```ts
{
  number: 123,
  htmlUrl: "https://github.com/owner/repo/pull/123"
}
```

The open-PR node reads `state.pullRequest` to confirm the PR exists and keeps the same `number` and `htmlUrl` in state. This is the handoff point where the frontend can later consume the PR link.

## 5. Typechecking

All touched packages pass:

```powershell
bun run check-types --filter=@repo/contracts
bun run check-types --filter=@repo/agent
bun run check-types --filter=sandbox-worker
```

## 6. Deferred

- Passing the PR link back to the frontend is not implemented yet.
- The PR title/body are minimal placeholders and can be improved later.
- The empty PR node assumes the sandbox has already been cloned by `prepare-sandbox`.
