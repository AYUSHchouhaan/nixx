import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

/**
 * Creates a read tool that reads up to 4 files in parallel and returns their contents.
 */
export function createReadTool(repoPath: string) {
  return tool(
    async ({ filePaths }: { filePaths: string[] }) => {
      const files = filePaths.slice(0, 10);
      const results = await Promise.all(
        files.map(async (filePath) => {
          try {
            const fullPath = path.join(repoPath, filePath);
            const content = await fs.readFile(fullPath, 'utf-8');
            return `=== ${filePath} ===\n${content}`;
          } catch (error) {
            return `=== ${filePath} ===\nError reading file: ${error instanceof Error ? error.message : String(error)}`;
          }
        })
      );
      return results.join('\n\n');
    },
    {
      name: 'read',
      description:
        'Read the full content of 1–6 files in parallel. Only include files that are directly relevant and you think should be read to the task. Max 4 files per call.',
      schema: z.object({
        filePaths: z
          .array(z.string())
          .min(1)
          .max(6)
          .describe('Array of file paths relative to the repo root (e.g. ["src/index.ts", "src/utils.ts"]). Max 4.'),
      }),
    }
  );
}
