import { createProgrammerGraph } from "@repo/agent";
import { BullMqSandboxClient } from "./bullmq-sandbox-client";
import { startResultConsumer } from "./result-consumer";

startResultConsumer();

const sandboxClient = new BullMqSandboxClient();

const server = Bun.serve({
  port: Number(process.env.AGENT_BRAIN_PORT ?? 4000),
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/run") {
      try {
        const body = (await request.json()) as {
          threadId: string;
          conversationId: string;
          sandboxId: string;
          query: string;
          notes?: string;
        };

        if (!body.threadId || !body.conversationId || !body.sandboxId || !body.query) {
          return Response.json(
            { error: "threadId, conversationId, sandboxId and query are required" },
            { status: 400 },
          );
        }

        const graph = createProgrammerGraph({
          sandboxClient,
          threadId: body.threadId,
          conversationId: body.conversationId,
          sandboxId: body.sandboxId,
        });

        const result = await graph.invoke({
          query: body.query,
          notes: body.notes ?? "",
        });

        return Response.json({ summary: result.summary });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Agent run failed";
        return Response.json({ error: message }, { status: 500 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`Agent brain listening on http://localhost:${server.port}`);
