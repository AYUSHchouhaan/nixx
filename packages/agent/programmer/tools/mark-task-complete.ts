import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * Signal-only tool for the programmer task-execution phase.
 *
 * The LLM calls this after it has fully implemented the current task to signal
 * that it is done. The summary is used by the graph to finish the run.
 * No side-effects — returns a simple acknowledgement string.
 */
export function createMarkTaskCompleteTool() {
  return tool(
    async ({ summary }: { summary: string }) => {
      return `Acknowledged: ${summary}`;
    },
    {
      name: 'mark_task_complete',
      description:
        'Call this tool ONLY when the current task is fully implemented and there is not need to go further and wanna end the loop . Provide a concise summary (20–30 words) of what was done.',
      schema: z.object({
        summary: z
          .string()
          .describe('Concise summary of what was implemented (20–30 words).'),
      }),
    }
  );
}
