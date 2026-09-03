import { Octokit } from "@octokit/rest";

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const url = new URL(repoUrl);
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  const [owner, repo] = parts;
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
  }
  return { owner, repo };
}

export async function createBranchRef(input: {
  repoUrl: string;
  branchName: string;
  installationToken: string;
  branch?: string;
}) {
  const { owner, repo } = parseRepoUrl(input.repoUrl);
  const octokit = new Octokit({ auth: input.installationToken });

  const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
  const baseBranch = input.branch ?? repoInfo.default_branch;
  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${input.branchName}`,
    sha: baseRef.object.sha,
  });

  return { branchName: input.branchName, baseBranch };
}

export async function createPullRequest(input: {
  repoUrl: string;
  branchName: string;
  baseBranch: string;
  installationToken: string;
  title: string;
  body: string;
}) {
  const { owner, repo } = parseRepoUrl(input.repoUrl);
  const octokit = new Octokit({ auth: input.installationToken });

  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: input.title,
    head: input.branchName,
    base: input.baseBranch,
    body: input.body,
  });

  return { number: pr.number, htmlUrl: pr.html_url, branchName: input.branchName };
}

export async function updatePullRequest(input: {
  repoUrl: string;
  pullRequestNumber: number;
  installationToken: string;
  title?: string;
  body?: string;
  state?: "open" | "closed";
}) {
  const { owner, repo } = parseRepoUrl(input.repoUrl);
  const octokit = new Octokit({ auth: input.installationToken });
  const { data } = await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: input.pullRequestNumber,
    title: input.title,
    body: input.body,
    state: input.state,
  });

  return {
    number: data.number,
    htmlUrl: data.html_url,
    state: data.state,
  };
}
