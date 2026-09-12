import type { Sandbox } from "@daytonaio/sdk";
import { shellQuote, toPosix } from "./path-utils";

const SEARCH_EXCLUDES = [
  "!node_modules",
  "!node_modules/**",
  "!.git",
  "!.git/**",
  "!.next",
  "!.next/**",
  "!dist",
  "!dist/**",
  "!build",
  "!build/**",
  "!.turbo",
  "!.turbo/**",
  "!.vercel",
  "!.vercel/**",
  "!.cache",
  "!.cache/**",
];

async function executeSearch(
  sandbox: Sandbox,
  repoDir: string,
  args: string[],
): Promise<{ output: string; exitCode: number }> {
  const response = await sandbox.process.executeCommand(
    ["rg", ...args.map(shellQuote)].join(" "),
    repoDir,
  );

  return {
    output: response.result ?? "",
    exitCode: response.exitCode ?? 0,
  };
}

export async function globFiles(
  sandbox: Sandbox,
  repoDir: string,
  patterns: string[],
): Promise<string> {
  const args = ["--files"];
  for (const exclude of SEARCH_EXCLUDES) {
    args.push("--glob", exclude);
  }
  for (const pattern of patterns) {
    args.push("--glob", pattern);
  }
  args.push(".");

  try {
    const response = await executeSearch(sandbox, repoDir, args);
    if (response.exitCode === 1 || !response.output.trim()) {
      return `No files found matching: ${patterns.join(", ")}`;
    }
    if (response.exitCode !== 0) {
      return `Error running glob search: ${response.output.trim()}`;
    }

    const files = response.output
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((file) => toPosix(file).replace(/^\.\//, ""));

    return `files matching:\n${files.join("\n")}`;
  } catch (error) {
    return `Error running glob search: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

export async function grepFiles(
  sandbox: Sandbox,
  repoDir: string,
  query: string,
): Promise<string> {
  const args = ["--ignore-case", "--files-with-matches"];
  for (const exclude of SEARCH_EXCLUDES) {
    args.push("--glob", exclude);
  }
  args.push("-e", query, ".");

  try {
    const response = await executeSearch(sandbox, repoDir, args);
    if (response.exitCode === 1 || !response.output.trim()) {
      return `No files found matching "${query}".`;
    }
    if (response.exitCode !== 0) {
      return `Error running grep search: ${response.output.trim()}`;
    }

    const files = response.output
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(0, 5)
      .map((file) => toPosix(file).replace(/^\.\//, ""));

    return `Found ${files.length} file(s) matching "${query}":\n${files.join("\n")}`;
  } catch (error) {
    return `Error running grep search: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}
