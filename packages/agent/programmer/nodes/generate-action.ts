import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { createSandboxTools } from "../tools";
import type { ProgrammerState } from "../types";
import { createChatModel } from "../model";

const HISTORY_WINDOW = 300;

function buildSystemPrompt(taskDescription: string): string {
  return `You are an expert software engineer implementing this task:
${taskDescription}

Work efficiently and use tools intentionally. Keep tool calls focused and avoid unnecessary repetition.

REASONING + TOOL USAGE

For every tool invocation:
- Include a short reasoning message in your assistant response.
- First, briefly reference what you just did or learned from the previous tool result.
- Then explain what you will do next and why.
- After that, include the appropriate tool call in the same response.
- Keep reasoning concise (1-2 sentences).
- Do not ask for confirmation before making a tool call unless the task is ambiguous or destructive.

After receiving a tool result:
- Briefly reference what you just learned, then explain what you will do next.
- Either make the next tool call or provide the final answer if the task is complete.

Tool guide:
- glob: Find files by path pattern when you do not know exact file locations.
- grep: Search file contents by keyword when you know what text to find.
- read: Read file contents before editing. Use for understanding exact current code and formatting.
- run: Run shell commands inside the sandbox for checks (test/build/list/status).
- mark_task_complete: Call only when all required work is done and no further tool/action is needed.

When the task is complete:
- If no further changes, verification, or tool calls are needed, call mark_task_complete.
`;
}

function buildFirstTaskMessage(state: ProgrammerState): HumanMessage {
  return new HumanMessage(
    `Query: "${state.query}"\n\nNotes:\n${state.notes || "(none)"}\n\nStart implementing this now. Go directly to the work - do not over-investigate.`,
  );
}

export async function generateActionNode(
  state: ProgrammerState,
  deps: import("../types").ProgrammerGraphDeps,
): Promise<Partial<ProgrammerState>> {
  const tools = createSandboxTools(deps);
  const llm = createChatModel().bindTools([
    tools.glob,
    tools.grep,
    tools.read,
    tools.run,
    tools.markTaskComplete,
  ]);

  const messageHistory = state.messages;
  const firstTaskMessage = buildFirstTaskMessage(state);
  const systemMessage = new SystemMessage(buildSystemPrompt(state.query));

  const inputMessages =
    messageHistory.length === 0
      ? [systemMessage, firstTaskMessage]
      : [systemMessage, ...messageHistory.slice(-HISTORY_WINDOW)];

  const responseMessage = (await llm.invoke(inputMessages)) as AIMessage;

  const newMessages =
    messageHistory.length === 0
      ? [firstTaskMessage, responseMessage]
      : [responseMessage];

  return { messages: newMessages };
}
