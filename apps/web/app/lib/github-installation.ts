import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";

function getAppCredentials() {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!appId || !privateKey) {
    throw new Error(
      "Missing GitHub App credentials: GITHUB_APP_ID, GITHUB_PRIVATE_KEY",
    );
  }

  return { appId, privateKey };
}

export async function getInstallationId(userAccessToken: string) {
  const octokit = new Octokit({ auth: userAccessToken });
  const { data } = await octokit.rest.apps.listInstallationsForAuthenticatedUser();
  const installation = data.installations.find(
    (item) => String(item.app_id) === process.env.GITHUB_APP_ID,
  );

  if (!installation) {
    throw new Error("No GitHub App installation found for the authenticated user");
  }

  return installation.id;
}

export async function createInstallationToken(
  installationId: number | string,
) {
  const { appId, privateKey } = getAppCredentials();
  const appAuth = createAppAuth({ appId, privateKey });
  const octokit = new Octokit({ auth: await appAuth({ type: "app" }).then(({ token }) => token) });
  const { data } = await octokit.rest.apps.createInstallationAccessToken({
    installation_id: Number(installationId),
  });

  return {
    token: data.token,
    expiresAt: data.expires_at,
  };
}

export async function fetchRepositories(installationToken: string) {
  const octokit = new Octokit({ auth: installationToken });
  return octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation);
}

export async function fetchBranches(
  installationToken: string,
  owner: string,
  repo: string,
) {
  const octokit = new Octokit({ auth: installationToken });
  return octokit.paginate(octokit.rest.repos.listBranches, {
    owner,
    repo,
  });
}
