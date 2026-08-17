import { ToolMessage, AIMessage } from '@langchain/core/messages';
import { createGrepTool, createReadTool, createEditTool, createNewFileTool, createGlobTool, createBashTool, createMarkTaskCompleteTool } from '../../tools';
import { emitAgent } from '../../ui/events';
import type { ProgrammerState } from '../types';

/**
 * Node: take-action
 *
 * Executes the single tool call from the last AI message,
 * appends the ToolMessage result, and loops back to generate-action.
 */
export async function takeActionNode(
  state: ProgrammerState
): Promise<Partial<ProgrammerState>> {

  const grepTool = createGrepTool(state.repoPath);
  const readTool = createReadTool(state.repoPath);
  const editTool = createEditTool(state.repoPath);
  const createFileTool = createNewFileTool(state.repoPath);
  const globTool = createGlobTool(state.repoPath);
  const bashTool = createBashTool(state.repoPath);
  const markTaskCompleteTool = createMarkTaskCompleteTool();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolMap: Record<string, any> = {
    glob: globTool,
    grep: grepTool,
    read: readTool,
    edit: editTool,
    create_file: createFileTool,
    bash: bashTool,
    mark_task_complete: markTaskCompleteTool,
  };

  // Find the last AI message with tool calls
  const lastAI = [...state.messages].reverse().find((m) => m.getType() === 'ai') as
    | AIMessage
    | undefined;

  if (!lastAI || !lastAI.tool_calls || lastAI.tool_calls.length === 0) {
    return { messages: [] };
  }

  // Execute only the first tool call
  const toolCall = lastAI.tool_calls[0];
  if (!toolCall) return { messages: [] };
  const { id, name, args } = toolCall;

  // For edit tool, emit the LLM's message intent
  if (name === 'edit' && lastAI.content && typeof lastAI.content === 'string') {
    emitAgent({
      type: 'edit_message',
      message: lastAI.content,
    });
  }

  const t = toolMap[name];
  let result: string;
  if (t) {
    try {
      result = String(await t.invoke(args));
    } catch (err) {
      result = `Error invoking ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    result = `Unknown tool: ${name}`;
  }

  if (name !== 'read') {
    emitAgent({ type: 'tool_result', name, result: result.slice(0, 300) });
  }

  const toolMsg = new ToolMessage({
    tool_call_id: id ?? name,
    content: result,
  });

  return { messages: [toolMsg] };
}