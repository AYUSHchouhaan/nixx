import { NextResponse } from "next/server";
import { getInstallationToken } from "../../../lib/github-installation";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token, expiresAt } = await getInstallationToken();
    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get installation token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
