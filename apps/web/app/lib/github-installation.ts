import { createSign } from "node:crypto";
import { db } from "@repo/db";
import { accounts } from "@repo/db/schema";
import { eq } from "drizzle-orm";

const GITHUB_API = "https://api.github.com";

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload: object, privateKey: string) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify({ iat: now, exp: now + 60, ...payload }),
  )}`;

  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(privateKey, "base64url");

  return `${unsigned}.${signature}`;
}

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

  const response = await fetch(`${GITHUB_API}/user/installations`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${userAccessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub user installations request failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as {
    installations: Array<{
      id: number;
      app_id: number;
    }>;
  };

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

export async function getInstallationToken(userId: string) {
  const accessToken = await getAccessToken(userId);
  const installationId = await getInstallationId(accessToken);
  const { token, expiresAt } = await createInstallationToken(installationId);
  return { installationId, token, expiresAt };
}

export async function createInstallationToken(
  installationId: number | string,
) {
  const { appId, privateKey } = getAppCredentials();
  const jwt = signJwt({ iss: appId }, privateKey);

  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub installation token request failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as {
    token: string;
    expires_at: string;
  };

  return {
    token: data.token,
    expiresAt: data.expires_at,
  };
}

export async function fetchRepositories(installationToken: string) {
  const response = await fetch(`${GITHUB_API}/installation/repositories`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${installationToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub repositories request failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as {
    repositories: Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      default_branch: string;
      html_url: string;
    }>;
  };

  return data.repositories;
}

export async function fetchBranches(
  installationToken: string,
  owner: string,
  repo: string,
) {
  const response = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/branches`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${installationToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub branches request failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as Array<{
    name: string;
    protected: boolean;
  }>;

  return data;
}
