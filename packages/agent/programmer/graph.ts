import { END, START, StateGraph } from "@langchain/langgraph";
import { AIMessage } from "@langchain/core/messages";
import { ProgrammerStateAnnotation } from "./types";
import type { ProgrammerState, ProgrammerGraphDeps } from "./types";
import {
  generateActionNode,
  takeActionNode,
  endConclusionNode,
  reasoningThinkingNode,
  prepareSandboxNode,
} from "./nodes";

function routeAfterGenerateAction(state: ProgrammerState): string {
  const lastAI = [...state.messages]
    .reverse()
    .find((m) => m.getType() === "ai") as AIMessage | undefined;

  if (lastAI?.tool_calls?.length) {
    const toolName = lastAI.tool_calls[0]?.name;
    if (toolName === "mark_task_complete") {
      return "end-conclusion";
    }
    return "take-action";
  }

  return "end-conclusion";
}

export function createProgrammerGraph(deps: ProgrammerGraphDeps) {
  const workflow = new StateGraph(ProgrammerStateAnnotation)
    .addNode("prepare-sandbox", (state, config) =>
      prepareSandboxNode(state, deps, config),
    )
    .addNode("generate-action", (state, config) =>
      generateActionNode(state, deps, config),
    )
    .addNode("take-action", (state, config) =>
      takeActionNode(state, deps, config),
    )
    .addNode("reasoning-thinking", reasoningThinkingNode)
    .addNode("end-conclusion", endConclusionNode)
    .addEdge(START, "prepare-sandbox")
    .addEdge("prepare-sandbox", "generate-action")
    .addConditionalEdges("generate-action", routeAfterGenerateAction, {
      "take-action": "take-action",
      "end-conclusion": "end-conclusion",
      "reasoning-thinking": "reasoning-thinking",
    })
    .addEdge("take-action", "generate-action")
    .addEdge("reasoning-thinking", "generate-action")
    .addEdge("end-conclusion", END);

  const graph = workflow.compile({ checkpointer: deps.checkpointer });
  graph.name = "Programmer Agent — Execute Tasks";
  return graph;
}
