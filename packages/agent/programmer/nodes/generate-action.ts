import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { createGrepTool, createReadTool, createEditTool, createNewFileTool, createGlobTool, createBashTool, createMarkTaskCompleteTool } from '../tools';
// import { emitAgent } from '../../ui/events';
import type { ProgrammerState } from '../types';
import { createChatModel } from '../model';

const HISTORY_WINDOW = 300;

// ...existing code...
function buildSystemPrompt(taskDescription: string): string {
  return `You are an expert software engineer implementing this task:
${taskDescription}

Work efficiently and use tools intentionally. Keep tool calls focused and avoid unnecessary repetition.

REASONING + TOOL USAGE

For every tool invocation:
- Include a short reasoning message in your assistant response.
- First, briefly reference what you just did or learned from the previous tool result (e.g., "I read the config file," or "The search found 3 matches,").
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
- edit: Modify an existing file. Pass a list of {oldStr, newStr} pairs applied in order — use multiple entries in one call instead of calling edit repeatedly on the same file.
- create_file: Create a new file with full content in one call.
- bash: Run quick repo-local commands for checks (for example test/build/list/status).
- mark_task_complete: Call only when all required work is done and no further tool/action is needed. When you call this tool the agent will exit the work loop — do not call it unless you are certain no further edits or tool calls are necessary.

When to use which:
1) Known file, one or more changes: read -> edit.
2) Need to locate by filename/path: glob -> read -> edit/create_file.
3) Need to locate by text/symbol: grep -> read -> edit/create_file.
4) Need verification: bash after edits.

CRITICAL EDITING RULES:
- ALWAYS read the file before editing.
- oldStr must match the file EXACTLY including whitespace, quotes, newlines, and punctuation.
- If content is on one line in the file, match it on one line.
- If content spans multiple lines, match it exactly.
- If an edit fails, read the file again before retrying.

Guidelines:
- Do not call tools repeatedly for the same information.
- Prefer one focused search, then read only relevant files.
- Keep edits minimal and preserve formatting.
- Ensure oldStr matches exactly what was read.
- Prefer progress over lengthy explanations.
- Avoid repeating the same reasoning across multiple responses.

When the task is complete:
- If no further code changes, verification, or tool calls are needed, call mark_task_complete.
`;
}
// ...existing code...
function buildFirstTaskMessage(state: ProgrammerState): HumanMessage {
  return new HumanMessage(
    `Query: "${state.query}"\n\nNotes:\n${state.notes || '(none)'}\n\nStart implementing this now. Go directly to the code change - do not over-investigate.`
  );
}

function emitResponseEvent(response: AIMessage): void {
  const toolCalls = response.tool_calls ?? [];
  const content = response.content;
  
  // Emit content if present
  // if (content && typeof content === 'string' && content.trim().length > 0) {
  //   emitAgent({
  //     type: 'llm_text',
  //     text: content,
  //   });
  // }
  
  // Emit tool calls if present
  // if (toolCalls.length > 0) {
  //   const firstCall = toolCalls[0];
  //   emitAgent({
  //     type: 'tool_call',
  //     name: firstCall?.name ?? '',
  //     args: (firstCall?.args ?? {}) as Record<string, unknown>,
  //   });
  // }
}


export async function generateActionNode(
  state: ProgrammerState
): Promise<Partial<ProgrammerState>> {
  const grepTool = createGrepTool(state.repoPath);
  const readTool = createReadTool(state.repoPath);
  const editTool = createEditTool(state.repoPath);
  const createFileTool = createNewFileTool(state.repoPath);
  const globTool = createGlobTool(state.repoPath);
  const bashTool = createBashTool(state.repoPath);
  const markTaskCompleteTool = createMarkTaskCompleteTool();

  const llm = createChatModel().bindTools([globTool, grepTool, readTool, editTool, createFileTool, bashTool, markTaskCompleteTool]);
  

  const messageHistory = state.messages;
  const firstTaskMessage = buildFirstTaskMessage(state);
  const systemMessage = new SystemMessage(buildSystemPrompt(state.query));

  const inputMessages =
    messageHistory.length === 0
      ? [systemMessage, firstTaskMessage]
      : [systemMessage, ...messageHistory.slice(-HISTORY_WINDOW)];

  // logMessageHistory removed

  const responseMessage = await llm.invoke(inputMessages);
  // if (!(responseMessage instanceof AIMessage)) {
  //   emitAgent({ type: 'error', message: 'Model returned non-AI message.' });
  //   return { messages: [] };
  // }

  const newMessages =
    messageHistory.length === 0
      ? [firstTaskMessage, responseMessage]
      : [responseMessage];

  emitResponseEvent(responseMessage);

  return { messages: newMessages };
}
