import { END, START, StateGraph } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { ProgrammerStateAnnotation } from './types';
import type { ProgrammerState } from './types';
import {
  generateActionNode,
  takeActionNode,
  endConclusionNode,
  reasoningThinkingNode,
} from './nodes';

/**
 * Conditional edge from generate-action:
 * - mark_task_complete tool call → end-conclusion
 * - other tool call              → take-action
 * - plain text response           → reasoning-thinking
 */
function routeAfterGenerateAction(state: ProgrammerState): string {
  const lastAI = [...state.messages].reverse().find((m) => m.getType() === 'ai') as
    | AIMessage
    | undefined;

  if (lastAI?.tool_calls && lastAI.tool_calls.length > 0) {
    const toolName = lastAI.tool_calls[0]?.name;
    if (toolName === 'mark_task_complete') {
      return 'end-conclusion';
    }
    return 'take-action';
  }

  // No tool call means the model produced direct text; emit it via reasoning node.
  return 'end-conclusion';
}

const workflow = new StateGraph(ProgrammerStateAnnotation)
  .addNode('generate-action', generateActionNode)
  .addNode('take-action', takeActionNode)
  .addNode('reasoning-thinking', reasoningThinkingNode)
  .addNode('end-conclusion', endConclusionNode)
  // ── edges ──
  .addEdge(START, 'generate-action')
  .addConditionalEdges('generate-action', routeAfterGenerateAction, {
    'take-action': 'take-action',
    'end-conclusion': 'end-conclusion',
    'reasoning-thinking': 'reasoning-thinking',
  })
  // After executing a tool, loop back to generate-action   
  .addEdge('take-action', 'generate-action')
  // After reasoning, loop back to generate-action
  .addEdge('reasoning-thinking', 'generate-action')
  .addEdge('end-conclusion', END);

export const programmerGraph = workflow.compile();
programmerGraph.name = 'Programmer Agent — Execute Tasks';
