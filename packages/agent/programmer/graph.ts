import { END, START, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ProgrammerStateAnnotation } from "./types";
import type { ProgrammerState, ProgrammerGraphDeps } from "./types";
import { buildSystemPrompt } from "./lib/system-prompt";
import {
  generateActionNode,
  takeActionNode,
  endConclusionNode,
  reasoningThinkingNode,
  prepareSandboxNode,
  createEmptyPrNode,
  openPullRequestNode,
} from "./nodes";

function appendUserMessageNode(
  state: ProgrammerState,
): Partial<ProgrammerState> {
  const userMessage = new HumanMessage(state.query);
  const systemMessage = new SystemMessage(buildSystemPrompt(state.query));
  const internalUserMessage = new HumanMessage(
    `Query: "${state.query}"\n\nStart implementing this now. Go directly to the work - do not over-investigate.`,
  );

  return {
    messages: [userMessage],
    internalMessages: [systemMessage, internalUserMessage],
  };
}

function routeAfterGenerateAction(state: ProgrammerState): string {
  const lastAI = [...state.messages]
    .reverse()
    .find((m) => m.getType() === "ai") as AIMessage | undefined;

  if (lastAI?.tool_calls?.length) {
    return "take-action";
  }

  return "open-pull-request";
}

function routeAfterTakeAction(state: ProgrammerState): string {
  const lastAI = [...state.messages]
    .reverse()
    .find((m) => m.getType() === "ai") as AIMessage | undefined;

  if (lastAI?.tool_calls?.some((tc) => tc.name === "mark_task_complete")) {
    return "open-pull-request";
  }

  return "generate-action";
}

export function createProgrammerGraph(deps: ProgrammerGraphDeps) {
  const workflow = new StateGraph(ProgrammerStateAnnotation)
    .addNode("append-user-message", appendUserMessageNode)
    .addNode("prepare-sandbox", (state, config) =>
      prepareSandboxNode(state, deps, config),
    )
    .addNode("create-empty-pr", (state, config) =>
      createEmptyPrNode(state, deps, config),
    )
    .addNode("generate-action", (state, config) =>
      generateActionNode(state, deps, config),
    )
    .addNode("take-action", (state, config) =>
      takeActionNode(state, deps, config),
    )
    .addNode("reasoning-thinking", reasoningThinkingNode)
    .addNode("open-pull-request", (state, config) =>
      openPullRequestNode(state, deps, config),
    )
    .addNode("end-conclusion", endConclusionNode)
    .addEdge(START, "append-user-message")
    .addEdge("append-user-message", "prepare-sandbox")
    .addEdge("prepare-sandbox", "create-empty-pr")
    .addEdge("create-empty-pr", "generate-action")
    .addConditionalEdges("generate-action", routeAfterGenerateAction, {
      "take-action": "take-action",
      "open-pull-request": "open-pull-request",
      "reasoning-thinking": "reasoning-thinking",
    })
    .addConditionalEdges("take-action", routeAfterTakeAction, {
      "generate-action": "generate-action",
      "open-pull-request": "open-pull-request",
    })
    .addEdge("reasoning-thinking", "generate-action")
    .addEdge("open-pull-request", "end-conclusion")
    .addEdge("end-conclusion", END);

  const graph = workflow.compile({ checkpointer: deps.checkpointer });
  graph.name = "Programmer Agent — Execute Tasks";
  return graph;
}
