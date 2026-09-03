import type { RunnableConfig } from "@langchain/core/runnables";
import type { ProgrammerState, ProgrammerGraphDeps } from "../types";
import { getConfigurableString } from "../lib/config";
import { createBranchRef, createPullRequest } from "../lib/github";
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

  const branchName = `nixx/${threadId}`;

  const { baseBranch } = await createBranchRef({
    repoUrl,
    branchName,
    installationToken,
    branch,
  });

  await checkoutBranch(deps.sandboxClient, config, branchName);
  await pushEmptyCommit(deps.sandboxClient, config, branchName);

  const pullRequest = await createPullRequest({
    repoUrl,
    branchName,
    baseBranch,
    installationToken,
    title: `Nixx — ${threadId}`,
    body: "Opened by Nixx to collect changes for this coding session.",
  });

  return {
    pullRequest: {
      number: pullRequest.number,
      htmlUrl: pullRequest.htmlUrl,
    },
  };
}
