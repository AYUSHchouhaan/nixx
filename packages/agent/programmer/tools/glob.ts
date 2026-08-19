import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

export function createGlobTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (args: { patterns: string[] }, config: RunnableConfig) => {
      const result = await sandboxCall(deps, config, "glob", {
        patterns: args.patterns,
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name: "glob",
      description:
        'Find files by path pattern inside the sandbox. Provide up to 7 glob patterns such as "**/src/**/*.ts" or "**/*.js" to locate files without reading contents.',
      schema: z.object({
        patterns: z
          .array(z.string())
          .min(1)
          .max(7)
          .describe(
            'Up to 7 glob patterns. Always use **/ prefix for directory names, e.g. ["**/src/**/*.ts", "**/components/**/*.tsx", "**/*.js"].',
          ),
      }),
    },
  );
}
