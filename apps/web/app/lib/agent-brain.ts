import { Client } from "@langchain/langgraph-sdk";

const AGENT_BRAIN_URL = process.env.AGENT_BRAIN_URL ?? "http://localhost:4000";
const client = new Client({ apiUrl: AGENT_BRAIN_URL });

export const AGENT_ASSISTANT_ID = "coding";

export type AgentStreamChunk = {
  id?: string;
  event: string;
  data: unknown;
};

function buildConfig(input: {
  threadId: string;
  sandboxId: string;
  repoUrl: string;
  branch?: string;
  installationToken: string;
  multitaskStrategy?: "reject" | "rollback" | "interrupt";
}) {
  return {
    configurable: {
      thread_id: input.threadId,
      sandbox_id: input.sandboxId,
      repo_url: input.repoUrl,
      branch: input.branch,
      installation_token: input.installationToken,
    },
  };
}

export async function runAgent(input: {
  threadId: string;
  sandboxId: string;
  query: string;
  notes?: string;
  repoUrl: string;
  branch?: string;
  installationToken: string;
  multitaskStrategy?: "reject" | "rollback" | "interrupt";
}) {
  const run = await client.runs.create(input.threadId, AGENT_ASSISTANT_ID, {
    input: { query: input.query, notes: input.notes ?? "" },
    config: buildConfig(input),
  });
  const result = (await client.runs.join(input.threadId, run.run_id)) as {
    summary?: string;
  };
  return { summary: result.summary ?? "" };
}

export function streamAgent(input: {
  threadId: string;
  sandboxId: string;
  query: string;
  notes?: string;
  repoUrl: string;
  branch?: string;
  installationToken: string;
  multitaskStrategy?: "reject" | "rollback" | "interrupt";
}): AsyncGenerator<AgentStreamChunk> {
  return client.runs.stream(input.threadId, AGENT_ASSISTANT_ID, {
    input: { query: input.query, notes: input.notes ?? "" },
    config: buildConfig(input),
    multitaskStrategy: input.multitaskStrategy,
    streamMode: ["messages-tuple", "values"],
  }) as AsyncGenerator<AgentStreamChunk>;
}

export type ThreadMessage = {
  id?: string;
  type: "human" | "ai" | "tool" | "system";
  content: string | Array<{ type: string; text?: string }>;
  tool_calls?: Array<{ id?: string; name: string; args: unknown }>;
  tool_call_id?: string;
};

function isThreadMessage(value: unknown): value is ThreadMessage {
  if (typeof value !== "object" || value === null || !("type" in value) || !("content" in value)) {
    return false;
  }

  return (
    ["human", "ai", "tool", "system"].includes(String(value.type)) &&
    (typeof value.content === "string" || Array.isArray(value.content))
  );
}

export async function getThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  try {
    const state = await client.threads.getState(threadId);
    const values = state.values;
    if (typeof values !== "object" || values === null || !("messages" in values)) {
      return [];
    }

    const messages = values.messages;
    return Array.isArray(messages) ? messages.filter(isThreadMessage) : [];
  } catch {
    return [];
  }
}
