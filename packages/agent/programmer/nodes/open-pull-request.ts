import type { RunnableConfig } from "@langchain/core/runnables";
import type { ProgrammerState, ProgrammerGraphDeps } from "../types";
import { getConfigurableString } from "../lib/config";
import { checkoutBranch, stageAllFiles, commitChanges, pushBranch } from "../lib/sandbox-git";

export async function openPullRequestNode(
  state: ProgrammerState,
  deps: ProgrammerGraphDeps,
  config: RunnableConfig,
): Promise<Partial<ProgrammerState>> {
  const threadId = getConfigurableString(config, "thread_id");
  const branchName = `nixx/${threadId}`;

  if (!state.pullRequest) {
    throw new Error("Missing pull request in state; cannot open pull request");
  }

  await checkoutBranch(deps.sandboxClient, config, branchName);
  await stageAllFiles(deps.sandboxClient, config);
  await commitChanges(deps.sandboxClient, config, `feat: nixx changes for ${threadId}`);
  await pushBranch(deps.sandboxClient, config, branchName);

  return {
    pullRequest: {
      number: state.pullRequest.number,
      htmlUrl: state.pullRequest.htmlUrl,
    },
  };
}
