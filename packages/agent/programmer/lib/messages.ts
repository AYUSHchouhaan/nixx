import { AIMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";

export function lastAIMessage(
  messages: readonly BaseMessage[],
): AIMessage | undefined {
  return messages.findLast((message): message is AIMessage =>
    AIMessage.isInstance(message),
  );
}
