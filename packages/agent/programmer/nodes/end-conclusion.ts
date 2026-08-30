import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ProgrammerState } from "../types";
import { createChatModel } from "../model";

export async function endConclusionNode(
  state: ProgrammerState,
): Promise<Partial<ProgrammerState>> {
  const llm = createChatModel();

  const sessionSummary = state.messages
    .slice(-40)
    .map((m) => {
      const type = m.getType();
      const content =
        typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (type === "ai") return `[Assistant]: ${content.slice(0, 500)}`;
      if (type === "tool") return `[Tool Result]: ${content.slice(0, 300)}`;
      if (type === "human") return `[User]: ${content.slice(0, 300)}`;
      return null;
    })
    .filter(Boolean)
    .join("\n");

  const response = await llm.invoke([
    new SystemMessage(
      "You are summarising a completed coding session. Write a clear, concise summary of what was done.",
    ),
    new HumanMessage(
      `Original Query: "${state.query}"\n\nKey Events:\n${sessionSummary}\n\nWrite the final summary now.`,
    ),
  ]);

  const summary =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  return { summary };
}
