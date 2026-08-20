import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { SandboxProvisionResult } from "@repo/contracts";

function runGit(
  args: string[],
  cwd: string,
): Promise<{ output: string; exitCode: number; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd,
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

function isGithubHttpsUrl(repoUrl: string): boolean {
  try {
    const url = new URL(repoUrl);
    return url.protocol === "https:" && url.hostname === "github.com";
  } catch {
    return false;
  }
}

export function resolveSandboxPath(baseRoot: string, sandboxId: string): string {
  return path.join(baseRoot, sandboxId);
}

export async function sandboxExists(sandboxPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(sandboxPath, ".git"));
    return true;
  } catch {
    return false;
  }
}

export async function provisionSandbox(
  baseRoot: string,
  input: {
    sandboxId: string;
    repoUrl: string;
    branch?: string;
    installationToken: string;
  },
): Promise<SandboxProvisionResult> {
  const sandboxPath = resolveSandboxPath(baseRoot, input.sandboxId);

  if (!isGithubHttpsUrl(input.repoUrl)) {
    return {
      sandboxId: input.sandboxId,
      sandboxPath,
      cloned: false,
      error: "Only https://github.com repository URLs are allowed",
    };
  }

  if (await sandboxExists(sandboxPath)) {
    return {
      sandboxId: input.sandboxId,
      sandboxPath,
      cloned: false,
    };
  }

  await fs.mkdir(sandboxPath, { recursive: true });

  const auth = Buffer.from(`x-access-token:${input.installationToken}`).toString(
    "base64",
  );

  const cloneArgs = [
    "-c",
    `http.extraheader=AUTHORIZATION: basic ${auth}`,
    "clone",
    "--depth",
    "1",
    ...(input.branch ? ["--branch", input.branch] : []),
    input.repoUrl,
    ".",
  ];

  const result = await runGit(cloneArgs, sandboxPath);

  if (result.exitCode !== 0) {
    return {
      sandboxId: input.sandboxId,
      sandboxPath,
      cloned: false,
      error: result.error ?? result.output,
    };
  }

  const configResults = await Promise.all([
    runGit(
      [
        "config",
        "http.extraheader",
        `AUTHORIZATION: basic ${auth}`,
      ],
      sandboxPath,
    ),
    runGit(["config", "user.name", "Nixx"], sandboxPath),
    runGit(
      ["config", "user.email", "noreply@nixx.dev"],
      sandboxPath,
    ),
    runGit(["config", "commit.gpgsign", "false"], sandboxPath),
  ]);

  for (const result of configResults) {
    if (result.exitCode !== 0) {
      return {
        sandboxId: input.sandboxId,
        sandboxPath,
        cloned: true,
        error: result.error ?? result.output,
      };
    }
  }

  return {
    sandboxId: input.sandboxId,
    sandboxPath,
    cloned: true,
  };
}
