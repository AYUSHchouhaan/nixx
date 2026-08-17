import { AIMessage, BaseMessage, ToolMessage } from '@langchain/core/messages';

export function sanitizeConversationMessages(messages: BaseMessage[]): BaseMessage[] {
  const cleaned = [...messages];

  for (let index = cleaned.length - 1; index >= 0; index -= 1) {
    const message = cleaned[index];
    if (!message || message.getType() !== 'ai') {
      continue;
    }

    const aiMessage = message as AIMessage;
    if (!aiMessage.tool_calls || aiMessage.tool_calls.length === 0) {
      continue;
    }

    const pendingToolIds = new Set(
      aiMessage.tool_calls
        .map((toolCall) => toolCall.id)
        .filter((id): id is string => Boolean(id))
    );

    const hasMatchingToolResult = cleaned.some(
      (candidate, candidateIndex) =>
        candidateIndex > index &&
        candidate.getType() === 'tool' &&
        pendingToolIds.has((candidate as ToolMessage).tool_call_id)
    );

    if (!hasMatchingToolResult) {
      return cleaned.slice(0, index);
    }
  }

  return cleaned;
}
