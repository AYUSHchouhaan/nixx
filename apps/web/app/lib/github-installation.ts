import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { db } from "@repo/db";
import { accounts } from "@repo/db/schema";
import { eq } from "drizzle-orm";

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
  const { appId } = getAppCredentials();
  const octokit = new Octokit({ auth: userAccessToken });
  const { data } = await octokit.rest.apps.listInstallationsForAuthenticatedUser();

  const installation = data.installations.find(
    (item) => String(item.app_id) === appId,
  );

  if (!installation) {
    throw new Error(
      `No GitHub App installation found for app ID ${appId}`,
    );
  }

  return installation.id;
}

export async function getAccessToken(userId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  if (!account?.accessToken) {
    throw new Error("GitHub account not linked or access token missing");
  }

  return account.accessToken;
}

export async function verifyGitHubUser(userAccessToken: string) {
  const octokit = new Octokit({ auth: userAccessToken });
  const { data } = await octokit.rest.users.getAuthenticated();
  return data;
}

export async function getInstallationToken(userId: string) {
  const accessToken = await getAccessToken(userId);
  await verifyGitHubUser(accessToken);
  const installationId = await getInstallationId(accessToken);
  const { token, expiresAt } = await createInstallationToken(installationId);
  return { installationId, token, expiresAt };
}

export async function createInstallationToken(
  installationId: number | string,
) {
  const { appId, privateKey } = getAppCredentials();
  const appAuth = createAppAuth({ appId, privateKey });
  const { token: appToken } = await appAuth({ type: "app" });
  const octokit = new Octokit({ auth: appToken });
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
