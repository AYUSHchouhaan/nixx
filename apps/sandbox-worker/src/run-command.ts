import type { Sandbox } from "@daytonaio/sdk";
import type { SandboxExecutionResult } from "./types";

export async function runCommand(
  sandbox: Sandbox,
  repoDir: string,
  command: string,
): Promise<SandboxExecutionResult> {
  try {
    const response = await sandbox.process.executeCommand(String(command), repoDir);
    return {
      output: response.result ?? "",
      exitCode: response.exitCode ?? 0,
    };
  } catch (error) {
    return {
      output: `run_command error: ${
        error instanceof Error ? error.message : String(error)
      }`,
      exitCode: 1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
