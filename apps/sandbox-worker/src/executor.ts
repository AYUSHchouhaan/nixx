import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export type SandboxCommandName = "read_file" | "glob" | "grep" | "run_command";

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
    default:
      return {
        output: "",
        exitCode: 1,
        error: `Unknown command: ${command}`,
      };
  }
}
