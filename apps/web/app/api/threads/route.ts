import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { createAgentThread } from "../../lib/agent-brain";

const createThreadBodySchema = z.object({
  sandboxId: z.string().optional(),
  repoUrl: z.string().optional(),
  branch: z.string().optional(),
  title: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof createThreadBodySchema>;
  try {
    body = createThreadBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = randomUUID();
  await createAgentThread(id);

  await db.insert(threads).values({
    id,
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
