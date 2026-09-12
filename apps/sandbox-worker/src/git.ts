import type { Sandbox } from "@daytonaio/sdk";
import { shellQuote } from "./path-utils";
import { runCommand } from "./run-command";
import type { SandboxExecutionResult } from "./types";

export function runGit(
  sandbox: Sandbox,
  repoDir: string,
  args: string[],
): Promise<SandboxExecutionResult> {
  const command = ["git", ...args.map(shellQuote)].join(" ");
  return runCommand(sandbox, repoDir, command);
}
