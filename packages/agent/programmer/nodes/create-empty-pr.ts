import type { RunnableConfig } from "@langchain/core/runnables";
import type { ProgrammerState, ProgrammerGraphDeps } from "../types";
import { getConfigurableString } from "../lib/config";
import { createEmptyPullRequest } from "../lib/github";
import { checkoutBranch, pushEmptyCommit } from "../lib/sandbox-git";

export async function createEmptyPrNode(
  state: ProgrammerState,
  deps: ProgrammerGraphDeps,
  config: RunnableConfig,
): Promise<Partial<ProgrammerState>> {
  const threadId = getConfigurableString(config, "thread_id");
  const repoUrl = getConfigurableString(config, "repo_url");
  const installationToken = getConfigurableString(config, "installation_token");

  if (state.pullRequest) {
    return {};
  }

  const branchValue = config.configurable?.branch;
  const branch =
    typeof branchValue === "string" && branchValue ? branchValue : undefined;

  const pullRequest = await createEmptyPullRequest({
    repoUrl,
    threadId,
    installationToken,
    branch,
  });

  await checkoutBranch(deps.sandboxClient, config, pullRequest.branchName);
  await pushEmptyCommit(deps.sandboxClient, config, pullRequest.branchName);

  return {
    pullRequest: {
      number: pullRequest.number,
      htmlUrl: pullRequest.htmlUrl,
    },
  };
}
