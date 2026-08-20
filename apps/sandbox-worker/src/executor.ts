import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

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

async function readFiles(root: string, filePaths: string[]): Promise<string> {
  const results = await Promise.all(
    filePaths.slice(0, 10).map(async (filePath) => {
      try {
        const fullPath = path.join(root, String(filePath));
        const content = await fs.readFile(fullPath, "utf-8");
        return `=== ${filePath} ===\n${content}`;
      } catch (error) {
        return `=== ${filePath} ===\nError reading file: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }),
  );
  return results.join("\n\n");
}

async function globFiles(root: string, patterns: string[]): Promise<string> {
  const files = new Set<string>();

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          ["node_modules", ".git", ".next", "dist", "build", ".turbo"].includes(
            entry.name,
          )
        ) {
          continue;
        }
        await walk(full);
      } else {
        const rel = path.relative(root, full).replace(/\\/g, "/");
        files.add(rel);
      }
    }
  }

  await walk(root);

  const matched = [...files].filter((file) =>
    patterns.some((pattern) => {
      const regex = new RegExp(
        "^" +
          pattern
            .replace(/\./g, "\\.")
            .replace(/\*\*/g, "§")
            .replace(/\*/g, "[^/]*")
            .replace(/§/g, ".*") +
          "$",
      );
      return regex.test(file);
    }),
  );

  return matched.length
    ? `files matching:\n${matched.join("\n")}`
    : `No files found matching: ${patterns.join(", ")}`;
}

async function grepFiles(root: string, query: string): Promise<string> {
  const matches: string[] = [];
  const needle = String(query).toLowerCase();

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          ["node_modules", ".git", ".next", "dist", "build", ".turbo"].includes(
            entry.name,
          )
        ) {
          continue;
        }
        await walk(full);
      } else {
        const content = await fs.readFile(full, "utf-8").catch(() => "");
        if (content.toLowerCase().includes(needle)) {
          matches.push(path.relative(root, full).replace(/\\/g, "/"));
        }
      }
    }
  }

  await walk(root);

  const files = matches.slice(0, 5);
  return files.length
    ? `Found ${files.length} file(s) matching "${query}":\n${files.join("\n")}`
    : `No files found matching "${query}".`;
}

async function createFile(root: string, filePath: string, content: string): Promise<string> {
  try {
    const fullPath = path.join(root, String(filePath));

    const exists = await fs
      .access(fullPath)
      .then(() => true)
      .catch(() => false);

    if (exists) {
      return `Error: "${filePath}" already exists. Use the "edit" tool to modify existing files.`;
    }

    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, String(content), "utf-8");
    return `Created new file "${filePath}" successfully.`;
  } catch (error) {
    return `Error creating "${filePath}": ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

async function editFile(
  root: string,
  filePath: string,
  edits: Array<{ oldStr: string; newStr: string }>,
): Promise<string> {
  try {
    const fullPath = path.join(root, String(filePath));

    let content: string;
    try {
      content = await fs.readFile(fullPath, "utf-8");
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

    await fs.writeFile(fullPath, content, "utf-8");
    return `Successfully applied ${edits.length} edit(s) to "${filePath}".`;
  } catch (error) {
    return `Error editing "${filePath}": ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

async function runGit(
  root: string,
  args: string[],
): Promise<SandboxExecutionResult> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: root,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });

    child.on("error", (err) => {
      resolve({
        output: `git spawn error: ${err.message}`,
        exitCode: 1,
        error: err.message,
      });
    });

    child.on("exit", (code) => {
      resolve({
        output: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n"),
        exitCode: code ?? 1,
      });
    });
  });
}

function runCommand(root: string, command: string): Promise<SandboxExecutionResult> {
  return new Promise((resolve) => {
    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
    const child = spawn(String(command), {
      cwd: root,
      shell,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });

    child.on("error", (err) => {
      resolve({
        output: `spawn error: ${err.message}`,
        exitCode: 1,
        error: err.message,
      });
    });

    child.on("exit", (code, signal) => {
      const parts: string[] = [];
      if (stdout.trim()) parts.push(`stdout:\n${stdout.trim()}`);
      if (stderr.trim()) parts.push(`stderr:\n${stderr.trim()}`);
      parts.push(`exitCode: ${code ?? "null"}${signal ? `, signal: ${signal}` : ""}`);
      resolve({ output: parts.join("\n\n"), exitCode: code ?? 1 });
    });
  });
}

export async function executeSandboxCommand(
  root: string,
  command: string,
  args: Record<string, unknown>,
): Promise<SandboxExecutionResult> {
  switch (command) {
    case "read_file":
      return {
        output: await readFiles(root, (args.filePaths as string[]) ?? []),
        exitCode: 0,
      };
    case "glob":
      return {
        output: await globFiles(root, (args.patterns as string[]) ?? []),
        exitCode: 0,
      };
    case "grep":
      return {
        output: await grepFiles(root, String(args.query ?? "")),
        exitCode: 0,
      };
    case "run_command":
      return runCommand(root, String(args.command ?? ""));
    case "create_file":
      return {
        output: await createFile(
          root,
          String(args.filePath ?? ""),
          String(args.content ?? ""),
        ),
        exitCode: 0,
      };
    case "edit_file":
      return {
        output: await editFile(
          root,
          String(args.filePath ?? ""),
          (args.edits as Array<{ oldStr: string; newStr: string }>) ?? [],
        ),
        exitCode: 0,
      };
    case "git":
      return runGit(root, (args.args as string[]) ?? []);
    default:
      return {
        output: "",
        exitCode: 1,
        error: `Unknown command: ${command}`,
      };
  }
}
