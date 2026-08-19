import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Signal-only tool for the planner context-gathering phase.
 *
 * The LLM calls this when it has explored enough of the codebase and is ready
 * to hand off to the generate-plan node. No side-effects — returns a simple
 * acknowledgement string. The actual routing is handled by the graph edge.
 */
export function createCompletePlanningTool() {
  return tool(
    async ({ reason }: { reason: string }) => {
      return `Acknowledged: ${reason}`;
    },
    {
      name: 'complete_planning',
      description:
        'Call this tool ONLY when you have gathered enough codebase context and are ready for the planning step. Provide a brief reason explaining what you discovered.',
      schema: z.object({
        reason: z
          .string()
          .describe('Brief explanation of what was found and why exploration is complete.'),
      }),
    }
  );
}
