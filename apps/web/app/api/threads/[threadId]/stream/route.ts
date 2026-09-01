import { auth, getGitHubInstallationId } from "../../../../lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@repo/db";
import { threads } from "@repo/db/schema";
import {
  streamAgent,
  type AgentStreamChunk,
} from "../../../../lib/agent-brain";
import { createInstallationToken } from "../../../../lib/github-installation";
import {
  type MultitaskStrategy,
  streamRequestBodySchema,
  threadMetadataSchema,
} from "../../../../lib/agent-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StreamBuild {
  threadId: string;
  sandboxId: string;
  query: string;
  notes: string;
  repoUrl: string;
  branch: string;
  multitaskStrategy?: MultitaskStrategy;
}

type StreamResult =
  | { ok: true; stream: AsyncGenerator<AgentStreamChunk> }
  | { ok: false; response: Response };

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function encode(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

async function buildStream(input: StreamBuild): Promise<StreamResult> {
  try {
    const installationId = await getGitHubInstallationId();
    if (!installationId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "GitHub installation ID missing" },
          { status: 401 },
        ),
      };
    }

    const { token: installationToken } = await createInstallationToken(
      installationId,
    );

    return {
      ok: true,
      stream: streamAgent({
        threadId: input.threadId,
        sandboxId: input.sandboxId,
        query: input.query,
        notes: input.notes,
        repoUrl: input.repoUrl,
        branch: input.branch,
        installationToken,
        multitaskStrategy: input.multitaskStrategy,
      }),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start agent stream";
    return {
      ok: false,
      response: NextResponse.json({ error: message }, { status: 500 }),
    };
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { threadId } = await params;
  const body = streamRequestBodySchema.parse(await request.json());

  const query = body.input?.query ?? body.query ?? "";
  const notes = body.input?.notes ?? body.notes ?? "";

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

  const metadata = threadMetadataSchema.parse(thread.metadata ?? {});
  const configurable = body.config?.configurable ?? {};

  const repoUrl =
    typeof configurable.repo_url === "string" && configurable.repo_url
      ? configurable.repo_url
      : body.input?.repoUrl ?? body.repoUrl ?? metadata.repoUrl ?? "";

  const branch =
    typeof configurable.branch === "string" && configurable.branch
      ? configurable.branch
      : body.input?.branch ?? body.branch ?? metadata.branch ?? "";

  if (!repoUrl) {
    return new Response("repoUrl is required", { status: 400 });
  }

  const result = await buildStream({
    threadId,
    sandboxId: thread.sandboxId ?? threadId,
    query,
    notes,
    repoUrl,
    branch,
    multitaskStrategy:
      body.input?.multitask_strategy ?? body.multitask_strategy,
  });

  if (!result.ok) {
    return result.response;
  }

  const bodyStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          controller.enqueue(encode(chunk.event, chunk.data));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Agent stream failed";
        controller.enqueue(
          encode("error", { error: "stream_failed", message }),
        );
      } finally {
        controller.close();
      }
    },
    cancel() {
      void result.stream.return?.(undefined);
    },
  });

  return new Response(bodyStream, { headers: SSE_HEADERS });
}
