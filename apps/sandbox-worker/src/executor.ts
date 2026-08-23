import path from "node:path";
import type { Sandbox } from "@daytonaio/sdk";

export type SandboxCommandName =
  | "read_file"
  | "glob"
  | "grep"
  | "run_command"
  | "create_file"
  | "edit_file"
  | "git";

export interface SandboxExecutionResult {
  output: string;
  exitCode: number;
  error?: string;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function absolutePath(repoDir: string, filePath: string): string {
  return path.posix.join(repoDir, toPosix(String(filePath)));
}

function stripRepoPrefix(repoDir: string, filePath: string): string {
  const prefix = `${repoDir}/`;
  const normalized = toPosix(filePath);
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

async function readFiles(
  sandbox: Sandbox,
  repoDir: string,
  filePaths: string[],
): Promise<string> {
  const results = await Promise.all(
    filePaths.slice(0, 10).map(async (filePath) => {
      try {
        const content = await sandbox.fs.downloadFile(
          absolutePath(repoDir, String(filePath)),
        );
        return `=== ${filePath} ===\n${content.toString("utf-8")}`;
      } catch (error) {
        return `=== ${filePath} ===\nError reading file: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }),
  );
  return results.join("\n\n");
}

async function globFiles(
  sandbox: Sandbox,
  repoDir: string,
  patterns: string[],
): Promise<string> {
  const files = new Set<string>();

  for (const pattern of patterns) {
    try {
      const result = await sandbox.fs.searchFiles(repoDir, String(pattern));
      for (const file of result.files) {
        files.add(stripRepoPrefix(repoDir, file));
      }
    } catch {
      // Ignore per-pattern failures and report on the union of what was found.
    }
  }

  const matched = [...files];
  return matched.length
    ? `files matching:\n${matched.join("\n")}`
    : `No files found matching: ${patterns.join(", ")}`;
}

async function grepFiles(
  sandbox: Sandbox,
  repoDir: string,
  query: string,
): Promise<string> {
  const matches = await sandbox.fs.findFiles(repoDir, String(query));
  const files = [...new Set(matches.map((m) => stripRepoPrefix(repoDir, m.file)))].slice(
    0,
    5,
  );
  return files.length
    ? `Found ${files.length} file(s) matching "${query}":\n${files.join("\n")}`
    : `No files found matching "${query}".`;
}

async function createFile(
  sandbox: Sandbox,
  repoDir: string,
  filePath: string,
  content: string,
): Promise<string> {
  try {
    const fullPath = absolutePath(repoDir, filePath);

    let exists = false;
    try {
      await sandbox.fs.getFileDetails(fullPath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      return `Error: "${filePath}" already exists. Use the "edit" tool to modify existing files.`;
    }

    const parentDir = path.posix.dirname(fullPath);
    await sandbox.process.executeCommand(`mkdir -p "${parentDir}"`);

    await sandbox.fs.uploadFile(Buffer.from(String(content), "utf-8"), fullPath);
    return `Created new file "${filePath}" successfully.`;
  } catch (error) {
    return `Error creating "${filePath}": ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

async function editFile(
  sandbox: Sandbox,
  repoDir: string,
  filePath: string,
  edits: Array<{ oldStr: string; newStr: string }>,
): Promise<string> {
  try {
    const fullPath = absolutePath(repoDir, filePath);

    let content: string;
    try {
      const buffer = await sandbox.fs.downloadFile(fullPath);
      content = buffer.toString("utf-8");
    } catch {
      return `Error: "${filePath}" does not exist. Use the "create_file" tool to create new files.`;
    }

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!edit) continue;
      let { oldStr, newStr } = edit;

      if (!content.includes(oldStr)) {
        const normalizedContent = content.replace(/\r\n/g, "\n");
        const normalizedOldStr = oldStr.replace(/\r\n/g, "\n");

        if (normalizedContent.includes(normalizedOldStr)) {
          content = normalizedContent;
          oldStr = normalizedOldStr;
          newStr = newStr.replace(/\r\n/g, "\n");
        } else {
          return `Error: edits[${i}] oldStr not found in "${filePath}".`;
        }
      }

      content = content.replace(oldStr, newStr);
    }

    await sandbox.fs.uploadFile(Buffer.from(content, "utf-8"), fullPath);
    return `Successfully applied ${edits.length} edit(s) to "${filePath}".`;
  } catch (error) {
    return `Error editing "${filePath}": ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

async function runCommand(
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

async function runGit(
  sandbox: Sandbox,
  repoDir: string,
  args: string[],
): Promise<SandboxExecutionResult> {
  const command = ["git", ...args].join(" ");
  return runCommand(sandbox, repoDir, command);
}

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
