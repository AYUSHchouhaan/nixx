import type { RunnableConfig } from "@langchain/core/runnables";
import type { SandboxClient, SandboxCallResult } from "@repo/contracts";
import { getConfigurableString } from "./config";

async function runGit(
  sandboxClient: SandboxClient,
  config: RunnableConfig,
  args: string[],
): Promise<SandboxCallResult> {
  return sandboxClient.call({
    threadId: getConfigurableString(config, "thread_id"),
    conversationId: getConfigurableString(config, "conversation_id"),
    sandboxId: getConfigurableString(config, "sandbox_id"),
    command: "git",
    args: { args },
  });
}

function ensureSuccess(result: SandboxCallResult, operation: string) {
  if (result.error) {
    throw new Error(`Git ${operation} failed: ${result.error}`);
  }
  if (result.exitCode !== 0) {
    throw new Error(`Git ${operation} failed: ${result.output}`);
  }
}

export async function checkoutBranch(
  sandboxClient: SandboxClient,
  config: RunnableConfig,
  branchName: string,
) {
  const fetchResult = await runGit(sandboxClient, config, [
    "fetch",
    "origin",
    branchName,
  ]);
  ensureSuccess(fetchResult, "fetch");

  const checkoutResult = await runGit(sandboxClient, config, [
    "checkout",
    branchName,
  ]);
  ensureSuccess(checkoutResult, "checkout");
}

export async function pushEmptyCommit(
  sandboxClient: SandboxClient,
  config: RunnableConfig,
  branchName: string,
) {
  const commitResult = await runGit(sandboxClient, config, [
    "commit",
    "--allow-empty",
    "-m",
    "chore: nixx empty pull request",
  ]);
  ensureSuccess(commitResult, "commit");

  const pushResult = await runGit(sandboxClient, config, [
    "push",
    "origin",
    branchName,
  ]);
  ensureSuccess(pushResult, "push");
}

export async function stageAllFiles(
  sandboxClient: SandboxClient,
  config: RunnableConfig,
) {
  const result = await runGit(sandboxClient, config, [
    "add",
    "-A",
    "--",
    ".",
    ":(exclude)node_modules",
    ":(exclude).git",
    ":(exclude).next",
    ":(exclude)dist",
    ":(exclude)build",
    ":(exclude).turbo",
  ]);
  ensureSuccess(result, "add");
}

export async function commitChanges(
  sandboxClient: SandboxClient,
  config: RunnableConfig,
  message: string,
) {
  const result = await runGit(sandboxClient, config, [
    "commit",
    "-m",
    message,
  ]);
  ensureSuccess(result, "commit");
}

export async function pushBranch(
  sandboxClient: SandboxClient,
  config: RunnableConfig,
  branchName: string,
) {
  const result = await runGit(sandboxClient, config, [
    "push",
    "origin",
    branchName,
  ]);
  ensureSuccess(result, "push");
}
