const GITHUB_API = "https://api.github.com";

function parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const url = new URL(repoUrl);
  const parts = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  const [owner, repo] = parts;
  if (!owner || !repo) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
  }
  return { owner, repo };
}

export async function createEmptyPullRequest(input: {
  repoUrl: string;
  threadId: string;
  installationToken: string;
  branch?: string;
}) {
  const { owner, repo } = parseRepoUrl(input.repoUrl);
  const branchName = `nixx/${input.threadId}`;

  const repoResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.installationToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!repoResponse.ok) {
    const body = await repoResponse.text();
    throw new Error(
      `GitHub repository lookup failed (${repoResponse.status}): ${body}`,
    );
  }

  const repoInfo = (await repoResponse.json()) as { default_branch: string };
  const baseBranch = input.branch ?? repoInfo.default_branch;

  const branchResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.installationToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!branchResponse.ok) {
    const body = await branchResponse.text();
    throw new Error(
      `GitHub base branch lookup failed (${branchResponse.status}): ${body}`,
    );
  }

  const baseRef = (await branchResponse.json()) as {
    object: { sha: string };
  };

  const createBranchResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.installationToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha,
      }),
    },
  );

  if (!createBranchResponse.ok) {
    const body = await createBranchResponse.text();
    throw new Error(
      `GitHub branch creation failed (${createBranchResponse.status}): ${body}`,
    );
  }

  const createPrResponse = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.installationToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `Nixx — ${input.threadId}`,
        head: branchName,
        base: baseBranch,
        body: "Opened by Nixx to collect changes for this coding session.",
      }),
    },
  );

  if (!createPrResponse.ok) {
    const body = await createPrResponse.text();
    throw new Error(
      `GitHub pull request creation failed (${createPrResponse.status}): ${body}`,
    );
  }

  const pr = (await createPrResponse.json()) as {
    number: number;
    html_url: string;
  };

  return { number: pr.number, htmlUrl: pr.html_url, branchName };
}
