import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

export function createReadTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (args: { filePaths: string[] }, config: RunnableConfig) => {
      const result = await sandboxCall(deps, config, "read_file", {
        filePaths: args.filePaths,
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name: "read",
      description:
        "Read the full content of 1-6 existing, repository-relative files in parallel. Read only files directly relevant to the task, and read a file before editing it. Avoid reading large or unrelated files when a narrower inspection is sufficient.",
      schema: z.object({
        filePaths: z
          .array(z.string())
          .min(1)
          .max(6)
          .describe(
            'Array of file paths relative to the repo root (e.g. ["src/index.ts", "src/utils.ts"]).',
          ),
      }),
    },
  );
}
