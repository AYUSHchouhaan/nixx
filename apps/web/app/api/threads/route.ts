import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    conversationId: string;
    sandboxId?: string;
    repoUrl?: string;
    branch?: string;
    title?: string;
  };

  if (!body.conversationId) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }

  const id = randomUUID();
  await db.insert(threads).values({
    id,
    conversationId: body.conversationId,
    userId: session.user.id,
    sandboxId: body.sandboxId ?? null,
    metadata: {
      repoUrl: body.repoUrl ?? null,
      branch: body.branch ?? null,
      title: body.title ?? null,
    },
  });

  return NextResponse.json({ id });
}
