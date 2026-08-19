import { ToolMessage, AIMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { createSandboxTools } from "../tools";
import type { ProgrammerState, ProgrammerGraphDeps } from "../types";
import type { RunnableConfig } from "@langchain/core/runnables";

export async function takeActionNode(
  state: ProgrammerState,
  deps: ProgrammerGraphDeps,
  config: RunnableConfig,
): Promise<Partial<ProgrammerState>> {
  const tools = createSandboxTools(deps);

  const toolMap: Record<string, StructuredToolInterface> = {
    glob: tools.glob,
    grep: tools.grep,
    read: tools.read,
    run: tools.run,
    create_file: tools.createFile,
    edit: tools.edit,
    mark_task_complete: tools.markTaskComplete,
  };

  const lastAI = [...state.messages]
    .reverse()
    .find((m) => m.getType() === "ai") as AIMessage | undefined;

  if (!lastAI?.tool_calls?.length) {
    return { messages: [] };
  }

  const toolCall = lastAI.tool_calls[0];
  if (!toolCall) return { messages: [] };
  const { id, name, args } = toolCall;

  const t = toolMap[name];
  let result: string;
  if (t) {
    try {
      result = String(await t.invoke(args, config));
    } catch (err) {
      result = `Error invoking ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  } else {
    result = `Unknown tool: ${name}`;
  }

  const toolMsg = new ToolMessage({
    tool_call_id: id ?? name,
    content: result,
  });

  return { messages: [toolMsg] };
}
