import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "../../lib/auth";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { getThreadMessages } from "../../lib/agent-brain";
import { ChatClient } from "./chat-client";

export const metadata: Metadata = {
  title: "Task — Nixx",
};

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string; repoUrl?: string; branch?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  const query = await searchParams;

  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, id))
    .limit(1);

  if (!thread || thread.userId !== session.user.id) {
    notFound();
  }

  const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
  const initialMessages = (await getThreadMessages(id)) as unknown as Array<{
    id?: string;
    type: "human" | "ai" | "tool" | "system";
    content: string | Array<{ type: string; text?: string }>;
    tool_calls?: Array<{ id?: string; name: string; args: unknown }>;
    tool_call_id?: string;
  }>;

  const repoUrl =
    query.repoUrl ??
    (typeof metadata.repoUrl === "string" ? metadata.repoUrl : "");
  const branch =
    query.branch ??
    (typeof metadata.branch === "string" ? metadata.branch : "");

  return (
    <ChatClient
      threadId={id}
      conversationId={thread.conversationId}
      initialPrompt={query.prompt ?? ""}
      repoUrl={repoUrl}
      branch={branch}
      initialMessages={initialMessages}
    />
  );
}
