import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";
import {
  getInstallationToken,
  fetchRepositories,
} from "../../../lib/github-installation";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token } = await getInstallationToken(session.user.id);
    const repositories = await fetchRepositories(token);

    return NextResponse.json({ repositories });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get repositories";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
