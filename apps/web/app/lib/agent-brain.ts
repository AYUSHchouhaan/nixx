import { Client } from "@langchain/langgraph-sdk";

const AGENT_BRAIN_URL = process.env.AGENT_BRAIN_URL ?? "http://localhost:4000";
const client = new Client({ apiUrl: AGENT_BRAIN_URL });

export async function runAgent(input: {
  threadId: string;
  conversationId: string;
  sandboxId: string;
  query: string;
  notes?: string;
  repoUrl: string;
  branch?: string;
  installationToken: string;
}) {
  const run = await client.runs.create(input.threadId, "coding", {
    input: { query: input.query, notes: input.notes ?? "" },
    config: {
      configurable: {
        thread_id: input.threadId,
        conversation_id: input.conversationId,
        sandbox_id: input.sandboxId,
        repo_url: input.repoUrl,
        branch: input.branch,
        installation_token: input.installationToken,
      },
    },
  });
  const result = (await client.runs.join(input.threadId, run.run_id)) as {
    summary?: string;
  };
  return { summary: result.summary ?? "" };
}
