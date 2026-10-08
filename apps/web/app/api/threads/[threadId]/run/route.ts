import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "../../../../lib/auth";
import { headers } from "next/headers";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { runAgent } from "../../../../lib/agent-brain";
import { createInstallationToken } from "../../../../lib/github-installation";
import { getGitHubInstallationId } from "../../../../lib/auth";

const runThreadBodySchema = z.object({
  query: z.string().min(1),
  repoUrl: z.string().min(1),
  branch: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { threadId } = await params;

  let body: z.infer<typeof runThreadBodySchema>;
  try {
    body = runThreadBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "query and repoUrl are required" },
      { status: 400 },
    );
  }

  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread || thread.userId !== session.user.id) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const sandboxId = thread.sandboxId ?? threadId;

  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json(
        { error: "GitHub installation ID missing" },
        { status: 401 },
      );
    }
    const { token: installationToken } = await createInstallationToken(installationId);

    const { summary } = await runAgent({
      threadId,
      sandboxId,
      query: body.query,
      repoUrl: body.repoUrl,
      branch: body.branch,
      installationToken,
    });

    return NextResponse.json({ summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
