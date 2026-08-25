import { NextResponse } from "next/server";
import { createInstallationToken } from "../../../lib/github-installation";
import { auth, getGitHubInstallationId } from "../../../lib/auth";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json(
        { error: "GitHub installation ID missing" },
        { status: 401 },
      );
    }

    const { token, expiresAt } = await createInstallationToken(installationId);

    return NextResponse.json({ installationId, token, expiresAt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get installation token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
