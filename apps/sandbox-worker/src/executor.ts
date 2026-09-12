import type { Sandbox } from "@daytonaio/sdk";
import { createFile } from "./create-file";
import { editFile } from "./edit-file";
import { runGit } from "./git";
import { globFiles, grepFiles } from "./search";
import { readFiles } from "./read";
import { runCommand } from "./run-command";
import type { SandboxExecutionResult } from "./types";

export type SandboxCommandName =
  | "read_file"
  | "glob"
  | "grep"
  | "run_command"
  | "create_file"
  | "edit_file"
  | "git";

export async function executeSandboxCommand(
  sandbox: Sandbox,
  repoDir: string,
  command: string,
  args: Record<string, unknown>,
): Promise<SandboxExecutionResult> {
  switch (command) {
    case "read_file":
      return {
        output: await readFiles(sandbox, repoDir, (args.filePaths as string[]) ?? []),
        exitCode: 0,
      };
    case "glob":
      return {
        output: await globFiles(sandbox, repoDir, (args.patterns as string[]) ?? []),
        exitCode: 0,
      };
    case "grep":
      return {
        output: await grepFiles(sandbox, repoDir, String(args.query ?? "")),
        exitCode: 0,
      };
    case "run_command":
      return runCommand(sandbox, repoDir, String(args.command ?? ""));
    case "create_file":
      return {
        output: await createFile(
          sandbox,
          repoDir,
          String(args.filePath ?? ""),
          String(args.content ?? ""),
        ),
        exitCode: 0,
      };
    case "edit_file":
      return {
        output: await editFile(
          sandbox,
          repoDir,
          String(args.filePath ?? ""),
          (args.edits as Array<{ oldStr: string; newStr: string }>) ?? [],
        ),
        exitCode: 0,
      };
    case "git":
      return runGit(sandbox, repoDir, (args.args as string[]) ?? []);
    default:
      return {
        output: "",
        exitCode: 1,
        error: `Unknown command: ${command}`,
      };
  }
}
