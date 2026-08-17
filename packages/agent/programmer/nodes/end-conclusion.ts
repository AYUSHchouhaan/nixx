import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ProgrammerState } from '../types';
import { createChatModel, getSelectedProviderConfig } from '../../config/provider';

/**
 * Node: end-conclusion
 *
 * All tasks are complete. Produces a final summary of everything that was done.
 */
export async function endConclusionNode(
  state: ProgrammerState
): Promise<Partial<ProgrammerState>> {

  const modelConfig = getSelectedProviderConfig(state.providerConfig);
  const llm = createChatModel(modelConfig);

  const conversationSummary = state.messages
    .slice(-40)
    .map((m) => {
      const type = m.getType();
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      if (type === 'ai') return `[Assistant]: ${content.slice(0, 500)}`;
      if (type === 'tool') return `[Tool Result]: ${content.slice(0, 300)}`;
      if (type === 'human') return `[User]: ${content.slice(0, 300)}`;
      return null;
    })
    .filter(Boolean)
    .join('\n');

  const response = await llm.invoke([
    new SystemMessage(
      'You are summarising a completed coding session. Write a clear, concise summary (8 - 10 sentences) of what you have done .'
    ),
    new HumanMessage(
      `Original Query: "${state.query}"

Notes:
${state.notes || '(none)'}

Key Events:
${conversationSummary}

Write the final summary now.`
    ),
  ]);

  const summary =
    typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

  // summary is emitted from cli.ts via the 'done' event after programmerGraph completes
  return { summary };
}
