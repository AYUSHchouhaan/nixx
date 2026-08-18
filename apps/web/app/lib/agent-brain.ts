const AGENT_BRAIN_URL = process.env.AGENT_BRAIN_URL ?? "http://localhost:4000";

export async function runAgent(input: {
  threadId: string;
  conversationId: string;
  sandboxId: string;
  query: string;
  notes?: string;
}) {
  const response = await fetch(`${AGENT_BRAIN_URL}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Agent brain request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as { summary: string };
}
