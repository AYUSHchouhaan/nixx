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
        "Call this signal-only tool only after the requested work is implemented and relevant verification is complete. Do not call it with any other tool. Include a concise 20–30 word summary of what changed, which checks were run, their result, and any unresolved issue.",
      schema: z.object({
        summary: z
          .string()
          .describe('Concise summary of what was implemented (20–30 words).'),
      }),
    }
  );
}
