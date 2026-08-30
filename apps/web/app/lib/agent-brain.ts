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

export async function getThreadMessages(threadId: string) {
  try {
    const state = await client.threads.getState(threadId);
    const values = (state.values ?? {}) as { messages?: unknown[] };
    return Array.isArray(values.messages) ? values.messages : [];
  } catch {
    return [];
  }
}
