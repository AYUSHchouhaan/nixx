import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

export function createRunTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (args: { command: string }, config: RunnableConfig) => {
      const result = await sandboxCall(deps, config, "run_command", {
        command: args.command,
      });

      if (result.error) {
        return `Error: ${result.error}`;
      }
      return result.output;
    },
    {
      name: "run",
      description:
        "Run a shell command inside the sandbox and return its output. Use for checks like test/build/list/status.",
      schema: z.object({
        command: z.string().describe("Shell command to execute inside the sandbox."),
      }),
    },
  );
}
