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

      if (result.error || result.exitCode !== 0) {
        return `Command failed with exit code ${result.exitCode}:\n${result.error ?? result.output}`;
      }
      return result.output;
    },
    {
      name: "run",
      description:
        "Run a shell command in the repository sandbox and return its output. Use for tests, builds, typechecks, lint, formatting, git diagnostics, and other repository checks. The repository is the working directory; output may be limited by the sandbox. Prefer read, glob, or grep for file inspection. Exit code 0 means success; any nonzero exit code means the command failed.",
      schema: z.object({
        command: z.string().describe("Shell command to execute inside the sandbox."),
      }),
    },
  );
}
