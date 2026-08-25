import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";
import {
  createInstallationToken,
  fetchRepositories,
} from "../../../lib/github-installation";
import { getGitHubInstallationId } from "../../../lib/auth";

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
      return NextResponse.json({ error: "GitHub installation ID missing" }, { status: 401 });
    }

    const { token } = await createInstallationToken(installationId);
    const repositories = await fetchRepositories(token);

    return NextResponse.json({ repositories });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get repositories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
