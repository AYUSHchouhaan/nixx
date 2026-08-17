import type { AIMessage } from '@langchain/core/messages';
import { emitAgent } from '../../ui/events';
import type { ProgrammerState } from '../types';

function toTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export async function reasoningThinkingNode(
  state: ProgrammerState
): Promise<Partial<ProgrammerState>> {
  const lastAI = [...state.messages].reverse().find((m) => m.getType() === 'ai') as
    | AIMessage
    | undefined;

  if (!lastAI) {
    return {};
  }

  // if (lastAI.tool_calls && lastAI.tool_calls.length > 0) {
  //   return {};
  // }

  // emitAgent({ type: 'llm_text', text: toTextContent(lastAI.content) });

  return {};
}
