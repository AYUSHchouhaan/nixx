import { NextResponse } from "next/server";
import { auth } from "../../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { getThreadMessages } from "../../../lib/agent-brain";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

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

  const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
  const messages = await getThreadMessages(threadId);

  return NextResponse.json({
    thread: {
      id: thread.id,
      sandboxId: thread.sandboxId,
      metadata,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    },
    messages,
  });
}
