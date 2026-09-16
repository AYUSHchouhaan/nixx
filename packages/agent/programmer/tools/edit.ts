import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

export function createEditTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (
      args: { filePath: string; edits: Array<{ oldStr: string; newStr: string }> },
      config: RunnableConfig,
    ) => {
      const result = await sandboxCall(deps, config, "edit_file", {
        filePath: args.filePath,
        edits: args.edits,
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name: "edit",
      description:
        "Edit one existing repository file by applying ordered {oldStr, newStr} replacements. Read the file first. Each oldStr must match the exact current text, including whitespace; include enough surrounding context to make it unique. Each replacement changes only the first matching occurrence. Automatically handles Windows (CRLF) versus Unix (LF) line endings.",
      schema: z.object({
        filePath: z
          .string()
          .describe("Path to an existing file, relative to the repository root."),
        edits: z
          .array(
            z.object({
              oldStr: z
                .string()
                .describe(
                  "Exact text to find in the current file content (case and whitespace sensitive). Include full newlines for multi-line content.",
                ),
              newStr: z
                .string()
                .describe("Text to replace the first matched oldStr occurrence."),
            }),
          )
          .min(1)
          .describe("Ordered replacements applied sequentially to the same file."),
      }),
    },
  );
}
