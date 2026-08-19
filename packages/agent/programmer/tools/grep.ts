import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

export function createGrepTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (args: { query: string }, config: RunnableConfig) => {
      const result = await sandboxCall(deps, config, "grep", {
        query: args.query,
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name: "grep",
      description:
        'Search file contents inside the sandbox. Supports multiple keywords with pipe: "termA|termB". Returns up to 5 matching file paths.',
      schema: z.object({
        query: z
          .string()
          .describe(
            'Search term(s) to find in files. Use pipe for multiple: "termA|termB".',
          ),
      }),
    },
  );
}
