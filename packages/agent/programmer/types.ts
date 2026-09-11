import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";
import type { SandboxClient } from "@repo/contracts";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

export const ProgrammerStateAnnotation = Annotation.Root({
  query: Annotation<string>,

  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  internalMessages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  summary: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  pullRequest: Annotation<{ number: number; htmlUrl: string } | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

export type ProgrammerState = typeof ProgrammerStateAnnotation.State;

export interface ProgrammerGraphDeps {
  sandboxClient: SandboxClient;
  checkpointer?: BaseCheckpointSaver;
}
