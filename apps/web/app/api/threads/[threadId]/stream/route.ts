import { auth } from "../../../../lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { streamAgent } from "../../../../lib/agent-brain";
import { createInstallationToken } from "../../../../lib/github-installation";
import { getGitHubInstallationId } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encode(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { threadId } = await params;
  const body = (await request.json()) as {
    input?: {
      query?: string;
      notes?: string;
      repoUrl?: string;
      branch?: string;
      multitask_strategy?: "reject" | "rollback" | "interrupt";
    } | null;
    config?: {
      configurable?: Record<string, unknown>;
    };
    multitask_strategy?: "reject" | "rollback" | "interrupt";
    query?: string;
    notes?: string;
    repoUrl?: string;
    branch?: string;
  };

  const query = body.input?.query ?? body.query ?? "";
  const notes = body.input?.notes ?? body.notes ?? "";
  const inputRepoUrl = body.input?.repoUrl;
  const inputBranch = body.input?.branch;
  const multitaskStrategy =
    body.input?.multitask_strategy ?? body.multitask_strategy;
  const configurable = body.config?.configurable ?? {};

  if (!query) {
    return new Response("query is required", { status: 400 });
  }

  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, threadId))
    .limit(1);

  if (!thread || thread.userId !== session.user.id) {
    return new Response("Thread not found", { status: 404 });
  }

  const metadata = (thread.metadata ?? {}) as Record<string, unknown>;
  const repoUrl =
    (typeof configurable.repo_url === "string"
      ? configurable.repo_url
      : "") ||
    inputRepoUrl ||
    body.repoUrl ||
    (typeof metadata.repoUrl === "string" ? metadata.repoUrl : "");
  const branch =
    (typeof configurable.branch === "string" ? configurable.branch : "") ||
    inputBranch ||
    body.branch ||
    (typeof metadata.branch === "string" ? metadata.branch : "");

  if (!repoUrl) {
    return new Response("repoUrl is required", { status: 400 });
  }

  const sandboxId = thread.sandboxId ?? threadId;

  let stream: ReturnType<typeof streamAgent>;

  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return NextResponse.json(
        { error: "GitHub installation ID missing" },
        { status: 401 },
      );
    }
    const { token: installationToken } = await createInstallationToken(installationId);

    stream = streamAgent({
      threadId,
      sandboxId,
      query,
      notes,
      repoUrl,
      branch,
      installationToken,
      multitaskStrategy,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start agent stream";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bodyStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(encode(chunk.event, chunk.data));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Agent stream failed";
        controller.enqueue(
          encode("error", {
            error: "stream_failed",
            message,
          }),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      void stream.return?.(undefined);
    },
  });

  return new Response(bodyStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
