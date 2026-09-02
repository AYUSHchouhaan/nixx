import { Client } from "@langchain/langgraph-sdk";
import { z } from "zod";
import {
  type ChatMessage,
  type MultitaskStrategy,
  type ThreadState,
  threadStateSchema,
} from "./agent-types";

const AGENT_BRAIN_URL = process.env.AGENT_BRAIN_URL ?? "http://localhost:4000";
const client = new Client<ThreadState>({ apiUrl: AGENT_BRAIN_URL });

export const AGENT_ASSISTANT_ID = "coding";

export async function createAgentThread(threadId: string) {
  return client.threads.create({ threadId, ifExists: "do_nothing" });
}

export interface AgentStreamChunk {
  id?: string;
  event: string;
  data: unknown;
}

export interface AgentRunInput {
  threadId: string;
  sandboxId: string;
  query: string;
  notes?: string;
  repoUrl: string;
  branch?: string;
  installationToken: string;
  multitaskStrategy?: MultitaskStrategy;
}

const runSummarySchema = z.object({
  summary: z.string().optional().default(""),
});

function buildConfig(input: AgentRunInput) {
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

export async function runAgent(input: AgentRunInput) {
  await createAgentThread(input.threadId);
  const run = await client.runs.create(input.threadId, AGENT_ASSISTANT_ID, {
    input: { query: input.query, notes: input.notes ?? "" },
    config: buildConfig(input),
  });
  const result = await client.runs.join(input.threadId, run.run_id);
  return runSummarySchema.parse(result);
}

export async function* streamAgent(
  input: AgentRunInput,
): AsyncGenerator<AgentStreamChunk> {
  await createAgentThread(input.threadId);

  yield* client.runs.stream(input.threadId, AGENT_ASSISTANT_ID, {
    input: { query: input.query, notes: input.notes ?? "" },
    config: buildConfig(input),
    multitaskStrategy: input.multitaskStrategy,
    streamMode: ["messages-tuple", "values"],
  });
}

export async function getThreadMessages(threadId: string): Promise<ChatMessage[]> {
  try {
    await createAgentThread(threadId);
    const state = await client.threads.getState<ThreadState>(threadId);
    return threadStateSchema.parse(state.values).messages;
  } catch {
    return [];
  }
}
