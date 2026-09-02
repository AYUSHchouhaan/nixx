import type { ProgrammerState, ProgrammerGraphDeps } from "../types";
import type { RunnableConfig } from "@langchain/core/runnables";
import { getConfigurableString } from "../lib/config";

export async function prepareSandboxNode(
  state: ProgrammerState,
  deps: ProgrammerGraphDeps,
  config: RunnableConfig,
): Promise<Partial<ProgrammerState>> {
  const threadId = getConfigurableString(config, "thread_id");
  const sandboxId = getConfigurableString(config, "sandbox_id");
  const repoUrl = getConfigurableString(config, "repo_url");
  const installationToken = getConfigurableString(config, "installation_token");

  const branchValue = config.configurable?.branch;
  const branch =
    typeof branchValue === "string" && branchValue ? branchValue : undefined;

  const result = await deps.sandboxClient.provision({
    threadId,
    sandboxId,
    repoUrl,
    branch,
    installationToken,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  return {};
}
