import { NextResponse } from "next/server";
import { auth } from "../../../../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { cancelAgentRun } from "../../../../../lib/agent-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread || thread.userId !== session.user.id) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  try {
    await cancelAgentRun(threadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel agent run";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
