# `@repo/agent`

`@repo/agent` contains Nixx's reusable LangGraph programmer implementation. It is a library package consumed by `apps/agent-brain`, not a standalone server.

## Responsibilities

- Define programmer graph state and dependencies.
- Build the task workflow and action loop.
- Bind repository tools to the model.
- Route tool calls through the shared `SandboxClient` abstraction.
- Support file inspection, editing, shell commands, Git operations, task completion, and Daytona previews.

## Structure

- `index.ts` — package entrypoint.
- `programmer/graph.ts` — compiled programmer graph.
- `programmer/types.ts` — graph state and dependency types.
- `programmer/nodes/` — graph nodes for preparation, planning, actions, and conclusion.
- `programmer/tools/` — model-facing repository and sandbox tools.
- `programmer/lib/` — prompts and supporting agent utilities.

## Usage

```ts
import { createProgrammerGraph } from "@repo/agent";

const graph = createProgrammerGraph({
  sandboxClient,
  checkpointer,
});
```

The host application supplies the sandbox client and optional LangGraph checkpointer. The package does not create Daytona clients or Redis connections directly.

## Commands

```bash
bun run --filter @repo/agent check-types
```

Changes to tool names or graph state should be coordinated with `@repo/contracts` and `apps/agent-brain`.
