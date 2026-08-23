import path from "node:path";
import type { Sandbox } from "@daytonaio/sdk";
import type { SandboxProvisionResult } from "@repo/contracts";
import {
  daytonaClient,
  DEFAULT_SANDBOX_CREATE_PARAMS,
  SANDBOX_ROOT_DIR,
} from "./daytona";

const sandboxRegistry = new Map<string, Sandbox>();

function isGithubHttpsUrl(repoUrl: string): boolean {
  try {
    const url = new URL(repoUrl);
    return url.protocol === "https:" && url.hostname === "github.com";
  } catch {
    return false;
  }
}

function sandboxName(sandboxId: string): string {
  return `nixx-${sandboxId}`;
}

export function repoPath(sandboxId: string): string {
  return path.posix.join(SANDBOX_ROOT_DIR, sandboxId);
}

export async function getSandbox(sandboxId: string): Promise<Sandbox> {
  const cached = sandboxRegistry.get(sandboxId);
  if (cached) {
    return cached;
  }

  const sandbox = await daytonaClient().get(sandboxName(sandboxId));
  sandboxRegistry.set(sandboxId, sandbox);
  return sandbox;
}

async function repoExists(sandbox: Sandbox, repoDir: string): Promise<boolean> {
  try {
    await sandbox.fs.listFiles(repoDir, { depth: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function provisionSandbox(input: {
  sandboxId: string;
  repoUrl: string;
  branch?: string;
  installationToken: string;
}): Promise<SandboxProvisionResult> {
  const sandboxId = input.sandboxId;
  const sandboxDir = repoPath(sandboxId);

  if (!isGithubHttpsUrl(input.repoUrl)) {
    return {
      sandboxId,
      sandboxPath: sandboxDir,
      cloned: false,
      error: "Only https://github.com repository URLs are allowed",
    };
  }

  const name = sandboxName(sandboxId);

  let sandbox: Sandbox;
  try {
    sandbox = await daytonaClient().get(name);
  } catch {
    sandbox = await daytonaClient().create({
      ...DEFAULT_SANDBOX_CREATE_PARAMS,
      name,
    });
  }
  sandboxRegistry.set(sandboxId, sandbox);

  if (await repoExists(sandbox, sandboxDir)) {
    return {
      sandboxId,
      sandboxPath: sandboxDir,
      cloned: false,
    };
  }

  const auth = Buffer.from(
    `x-access-token:${input.installationToken}`,
  ).toString("base64");

  await sandbox.git.clone(
    input.repoUrl,
    sandboxDir,
    input.branch,
    undefined,
    "x-access-token",
    input.installationToken,
    false,
    1,
  );

  await sandbox.git.setConfig(
    "http.extraheader",
    `AUTHORIZATION: basic ${auth}`,
    "local",
    sandboxDir,
  );
  await sandbox.git.configureUser("Nixx", "noreply@nixx.dev", "local", sandboxDir);
  await sandbox.git.setConfig("commit.gpgsign", "false", "local", sandboxDir);

  return {
    sandboxId,
    sandboxPath: sandboxDir,
    cloned: true,
  };
}
