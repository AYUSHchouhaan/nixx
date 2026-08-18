import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { conversations } from "@repo/db/schema";

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = randomUUID();
  await db.insert(conversations).values({
    id,
    userId: session.user.id,
  });

  return NextResponse.json({ id });
}
