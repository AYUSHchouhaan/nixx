import { createSign } from "node:crypto";

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

export async function getInstallationToken() {
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!appId || !installationId || !privateKey) {
    throw new Error(
      "Missing GitHub App credentials: GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_PRIVATE_KEY",
    );
  }

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
