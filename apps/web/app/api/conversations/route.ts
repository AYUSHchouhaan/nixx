import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { conversations, threads } from "@repo/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, session.user.id))
    .orderBy(desc(conversations.updatedAt));

  const threadRows = userConversations.length
    ? await db
        .select()
        .from(threads)
        .where(
          inArray(
            threads.conversationId,
            userConversations.map((conversation) => conversation.id),
          ),
        )
        .orderBy(desc(threads.updatedAt))
    : [];

  return NextResponse.json({
    conversations: userConversations,
    threads: threadRows,
  });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
  };

  const id = randomUUID();
  await db.insert(conversations).values({
    id,
    userId: session.user.id,
    title: body.title ?? null,
  });

  return NextResponse.json({ id });
}
