import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type { SandboxClient } from "@repo/contracts";

export const ProgrammerStateAnnotation = Annotation.Root({
  query: Annotation<string>,

  notes: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  summary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),
});

export type ProgrammerState = typeof ProgrammerStateAnnotation.State;

export interface ProgrammerGraphDeps {
  sandboxClient: SandboxClient;
  threadId: string;
  conversationId: string;
  sandboxId: string;
}
