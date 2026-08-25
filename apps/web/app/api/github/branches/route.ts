import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";
import {
  createInstallationToken,
  fetchBranches,
} from "../../../lib/github-installation";
import { getGitHubInstallationId } from "../../../lib/auth";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo query parameter" },
      { status: 400 },
    );
  }

  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json({ error: "GitHub installation ID missing" }, { status: 401 });
    }

    const { token } = await createInstallationToken(installationId);
    const branches = await fetchBranches(token, owner, repo);

    return NextResponse.json({ branches });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get branches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
