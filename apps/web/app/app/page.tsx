import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "../lib/auth";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq, desc } from "drizzle-orm";
import { AppShell } from "./app-shell";

export const metadata: Metadata = {
  title: "App — Nixx",
};

export default async function AppPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  const threadRows = await db
    .select()
    .from(threads)
    .where(eq(threads.userId, session.user.id))
    .orderBy(desc(threads.updatedAt));


  const initialThreads = threadRows.map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      title: typeof metadata.title === "string" ? metadata.title : null,
      repoUrl: typeof metadata.repoUrl === "string" ? metadata.repoUrl : null,
      branch: typeof metadata.branch === "string" ? metadata.branch : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  return (
    <AppShell initialThreads={initialThreads} />
  );
}
