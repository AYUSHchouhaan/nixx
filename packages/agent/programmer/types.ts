import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import type { ProviderRuntimeConfig } from '../config/provider';

export const ProgrammerStateAnnotation = Annotation.Root({
  /** The user's original query */
  query: Annotation<string>,

  /** Absolute path to the repo on disk */
  repoPath: Annotation<string>,

  /** Active provider/model configuration for this run */
  providerConfig: Annotation<ProviderRuntimeConfig>({
    reducer: (_, update) => update,
    default: () => ({
      selectedProvider: 'openai',
      providers: {
        openai: { apiKey: '', model: 'gpt-5-mini' },
        anthropic: { apiKey: '', model: 'haiku 4.5' },
        google: { apiKey: '', model: 'gemini 1.5 flash' },
      },
    }),
  }),

  /** Optional execution notes/context to guide implementation */
  notes: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),

  /**
   * Internal conversation messages — the main context.
   * HumanMessage, AIMessage (with tool_calls), ToolMessage flow.
   */
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  /** Summary produced by end-conclusion node */
  summary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),
});

export type ProgrammerState = typeof ProgrammerStateAnnotation.State;
