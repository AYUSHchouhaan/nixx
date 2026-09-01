import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "../../lib/auth";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { getThreadMessages, type ThreadMessage } from "../../lib/agent-brain";
import { ChatClient } from "./chat-client";

export const metadata: Metadata = {
  title: "Task — Nixx",
};

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const { prompt } = await searchParams;

  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, id))
    .limit(1);

  if (!thread || thread.userId !== session.user.id) {
    notFound();
  }

  const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
  const initialMessages: ThreadMessage[] = await getThreadMessages(id);

  const repoUrl = typeof metadata.repoUrl === "string" ? metadata.repoUrl : "";
  const branch = typeof metadata.branch === "string" ? metadata.branch : "";

  return (
    <ChatClient
      threadId={id}
      repoUrl={repoUrl}
      branch={branch}
      initialMessages={initialMessages}
      initialPrompt={prompt ?? ""}
    />
  );
}
