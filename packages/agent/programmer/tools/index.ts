import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { SandboxCommandName } from "@repo/contracts";
import type { ProgrammerGraphDeps } from "../types";

function makeTool(
  deps: ProgrammerGraphDeps,
  name: string,
  description: string,
  command: SandboxCommandName,
  schema: z.ZodTypeAny,
  mapArgs: (args: Record<string, unknown>) => Record<string, unknown>,
) {
  return tool(
    async (raw: Record<string, unknown>) => {
      const result = await deps.sandboxClient.call({
        threadId: deps.threadId,
        conversationId: deps.conversationId,
        sandboxId: deps.sandboxId,
        command,
        args: mapArgs(raw),
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name,
      description,
      schema,
    },
  );
}

export function createSandboxTools(deps: ProgrammerGraphDeps) {
  return {
    read: makeTool(
      deps,
      "read",
      "Read the full content of one or more files in the sandbox.",
      "read_file",
      z.object({
        filePaths: z
          .array(z.string())
          .min(1)
          .max(6)
          .describe("Array of file paths relative to the repository root."),
      }),
      (args) => ({ filePaths: args.filePaths }),
    ),

    glob: makeTool(
      deps,
      "glob",
      "Find files by glob pattern in the sandbox repository.",
      "glob",
      z.object({
        patterns: z
          .array(z.string())
          .min(1)
          .max(7)
          .describe("Glob patterns such as '**/*.ts'."),
      }),
      (args) => ({ patterns: args.patterns }),
    ),

    grep: makeTool(
      deps,
      "grep",
      "Search file contents in the sandbox repository.",
      "grep",
      z.object({
        query: z.string().describe("Search term(s) to find in files."),
      }),
      (args) => ({ query: args.query }),
    ),

    run: makeTool(
      deps,
      "run",
      "Run a shell command inside the sandbox and return its output.",
      "run_command",
      z.object({
        command: z.string().describe("Shell command to execute."),
      }),
      (args) => ({ command: args.command }),
    ),

    markTaskComplete: tool(
      async ({ summary }: { summary: string }) => {
        return `Acknowledged: ${summary}`;
      },
      {
        name: "mark_task_complete",
        description:
          "Call this ONLY when the current task is fully implemented and no further tool calls are needed. Provide a concise summary.",
        schema: z.object({
          summary: z.string().describe("Concise summary of what was implemented."),
        }),
      },
    ),
  };
}

export type SandboxTools = ReturnType<typeof createSandboxTools>;
