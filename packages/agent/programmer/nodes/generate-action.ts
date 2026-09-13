import { createSandboxTools } from "../tools";
import type { ProgrammerState } from "../types";
import { createChatModel } from "../model";
import type { RunnableConfig } from "@langchain/core/runnables";

export async function generateActionNode(
  state: ProgrammerState,
  deps: import("../types").ProgrammerGraphDeps,
  config: RunnableConfig,
): Promise<Partial<ProgrammerState>> {
  const tools = createSandboxTools(deps);
  const llm = createChatModel().bindTools([
    tools.glob,
    tools.grep,
    tools.read,
    tools.run,
    tools.createFile,
    tools.edit,
    tools.markTaskComplete,
  ]);

  const responseMessage = await llm.invoke(state.internalMessages, config);

  return { messages: [responseMessage], internalMessages: [responseMessage] };
}
