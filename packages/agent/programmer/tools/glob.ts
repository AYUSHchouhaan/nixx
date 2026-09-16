import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

export function createGlobTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (
      args: {
        patterns: string[];
        maxResults?: number;
        includeDirectories?: boolean;
        followSymlinks?: boolean;
      },
      config: RunnableConfig,
    ) => {
      const result = await sandboxCall(deps, config, "glob", {
        patterns: args.patterns,
        maxResults: args.maxResults,
        includeDirectories: args.includeDirectories,
        followSymlinks: args.followSymlinks,
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name: "glob",
      description:
        "Find repository-relative file paths using glob patterns. Searches automatically exclude node_modules, .git, build output, and cache directories. Use a narrow pattern such as src/**/*.ts, **/*.tsx, or packages/*/src/**; broad patterns such as **/* are rejected. Results are sorted, capped, and report when truncated.",
      schema: z.object({
        patterns: z
          .array(z.string().min(1))
          .min(1)
          .max(7)
          .describe(
            'Repository-relative patterns, for example ["src/**/*.ts", "**/*.tsx", "packages/*/src/**"]. Do not use absolute paths, .. segments, or broad **/* searches.',
          ),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Maximum number of paths to return; defaults to 200."),
        includeDirectories: z
          .boolean()
          .optional()
          .describe("Reserved for directory-aware search backends."),
        followSymlinks: z
          .boolean()
          .optional()
          .describe("Whether to follow symlinks while searching."),
      }),
    },
  );
}
