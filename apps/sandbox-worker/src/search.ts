import type { Sandbox } from "@daytonaio/sdk";
import { shellQuote, toPosix } from "./path-utils";
import type { SandboxExecutionResult } from "./types";

const DEFAULT_MAX_RESULTS = 200;
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

function isUnboundedPattern(pattern: string): boolean {
  const normalized = toPosix(pattern).trim();
  return normalized === "**" || normalized === "**/*" || normalized === "**/**";
}

function normalizePath(filePath: string): string {
  return toPosix(filePath).replace(/^\.\//, "");
}

async function executeSearch(
  sandbox: Sandbox,
  repoDir: string,
  args: string[],
): Promise<SandboxExecutionResult> {
  try {
    const response = await sandbox.process.executeCommand(
      ["rg", ...args.map(shellQuote)].join(" "),
      repoDir,
    );

    return {
      output: response.result ?? "",
      exitCode: response.exitCode ?? 2,
    };
  } catch (error) {
    return {
      output: "",
      exitCode: 2,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function globFiles(
  sandbox: Sandbox,
  repoDir: string,
  patterns: string[],
  maxResults = DEFAULT_MAX_RESULTS,
  includeDirectories = false,
  followSymlinks = false,
): Promise<SandboxExecutionResult> {
  if (patterns.length === 0) {
    return { output: "No glob patterns provided.", exitCode: 2 };
  }

  if (patterns.some(isUnboundedPattern)) {
    return {
      output: "",
      exitCode: 2,
      error: "Unbounded glob patterns such as **/* are not allowed; provide a narrower pattern.",
    };
  }

  const limit = Math.max(1, Math.min(maxResults, DEFAULT_MAX_RESULTS));
  const args = ["--files", "--color", "never"];
  if (followSymlinks) args.push("--follow");
  for (const exclude of SEARCH_EXCLUDES) {
    args.push("--glob", exclude);
  }
  for (const pattern of patterns) {
    args.push("--glob", pattern);
  }
  args.push(".");

  const response = await executeSearch(sandbox, repoDir, args);
  if (response.exitCode > 1) {
    return {
      ...response,
      error: response.error ?? (response.output.trim() || "Glob search failed."),
    };
  }

  const files = response.output
    .split(/\r?\n/)
    .map(normalizePath)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const matchedFiles = files.slice(0, limit + 1);
  const truncated = matchedFiles.length > limit;
  const results = matchedFiles.slice(0, limit);
  const omitted = truncated ? files.length - results.length : 0;
  const output = results.length
    ? `Files matching ${patterns.join(", ")}:\n${results.join("\n")}${
        truncated
          ? `\n\nResults truncated. ${omitted} additional file(s) omitted.`
          : ""
      }`
    : `No files found matching: ${patterns.join(", ")}`;

  return {
    output,
    exitCode: results.length ? 0 : 1,
  };
}

export async function grepFiles(
  sandbox: Sandbox,
  repoDir: string,
  query: string,
  maxResults = DEFAULT_MAX_RESULTS,
): Promise<SandboxExecutionResult> {
  if (!query.trim()) {
    return { output: "", exitCode: 2, error: "A grep query is required." };
  }

  const limit = Math.max(1, Math.min(maxResults, DEFAULT_MAX_RESULTS));
  const args = ["--ignore-case", "--line-number", "--with-filename", "--color", "never"];
  for (const exclude of SEARCH_EXCLUDES) {
    args.push("--glob", exclude);
  }
  args.push("-e", query, ".");

  const response = await executeSearch(sandbox, repoDir, args);
  if (response.exitCode > 1) {
    return {
      ...response,
      error: response.error ?? (response.output.trim() || "Grep search failed."),
    };
  }

  const matches = response.output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((match) => {
      const separator = match.match(/^(.+?):(\d+):(.*)$/);
      if (!separator) return normalizePath(match);
      return `${normalizePath(separator[1] ?? "")}:${separator[2]}:${separator[3]}`;
    })
    .sort((a, b) => a.localeCompare(b));

  const limitedMatches = matches.slice(0, limit + 1);
  const truncated = limitedMatches.length > limit;
  const results = limitedMatches.slice(0, limit);
  const omitted = truncated ? matches.length - results.length : 0;
  const output = results.length
    ? `Matches for "${query}":\n${results.join("\n")}${
        truncated
          ? `\n\nResults truncated. ${omitted} additional match(es) omitted.`
          : ""
      }`
    : `No matches found for "${query}".`;

  return {
    output,
    exitCode: results.length ? 0 : 1,
  };
}
