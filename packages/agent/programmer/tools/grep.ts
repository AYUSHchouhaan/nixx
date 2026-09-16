import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

export function createGrepTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (
      args: { query: string; maxResults?: number },
      config: RunnableConfig,
    ) => {
      const result = await sandboxCall(deps, config, "grep", {
        query: args.query,
        maxResults: args.maxResults,
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name: "grep",
      description:
        "Search repository files with a case-insensitive regular expression. Searches automatically exclude node_modules, .git, build output, and cache directories. Returns matching repository-relative paths, line numbers, and lines; results are sorted, capped, and report when truncated. Use a narrow pattern or query a specific path when possible. Use read to inspect the surrounding file after locating a match.",
      schema: z.object({
        query: z
          .string()
          .min(1)
          .describe(
            'Case-insensitive regular expression to search for, such as "useState|useEffect" or "className=". Regex syntax is supported; escape special characters for literal searches.',
          ),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of matching lines to return; defaults to 200."),
      }),
    },
  );
}
