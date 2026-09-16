import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

export function createFileTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (
      args: { filePath: string; content: string },
      config: RunnableConfig,
    ) => {
      const result = await sandboxCall(deps, config, "create_file", {
        filePath: args.filePath,
        content: args.content,
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name: "create_file",
      description:
        'Create a new repository file with the given complete content. Use this only after confirming the file does not exist; use "edit" to modify an existing file. Do not create backup or duplicate files.',
      schema: z.object({
        filePath: z
          .string()
          .describe(
            'File path relative to the repo root (e.g. "src/utils/helper.ts").',
          ),
        content: z.string().describe("The full content to write into the new file."),
      }),
    },
  );
}
