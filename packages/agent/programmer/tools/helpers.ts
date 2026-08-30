import type { RunnableConfig } from "@langchain/core/runnables";
import type { SandboxCommandName, SandboxCallResult } from "@repo/contracts";
import type { ProgrammerGraphDeps } from "../types";

export function getConfigurableId(config: RunnableConfig, name: string): string {
  const value = config.configurable?.[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing configurable.${name}`);
  }
  return value;
}

export async function sandboxCall(
  deps: ProgrammerGraphDeps,
  config: RunnableConfig,
  command: SandboxCommandName,
  args: Record<string, unknown>,
): Promise<SandboxCallResult> {
  return deps.sandboxClient.call({
    threadId: getConfigurableId(config, "thread_id"),
    sandboxId: getConfigurableId(config, "sandbox_id"),
    command,
    args,
  });
}
