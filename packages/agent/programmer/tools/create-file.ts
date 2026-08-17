import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

/**
 * Creates a create-file tool that writes a brand-new file to disk.
 * Fails if the file already exists — use "edit" for modifying existing files.
 */
export function createNewFileTool(repoPath: string) {
  return tool(
    async ({ filePath, content }: { filePath: string; content: string }) => {
      try {
        const fullPath = path.join(repoPath, filePath);

        if (fs.existsSync(fullPath)) {
          return `Error: "${filePath}" already exists. Use the "edit" tool to modify existing files.`;
        }

        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        return `Created new file "${filePath}" successfully.`;
      } catch (error) {
        return `Error creating "${filePath}": ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'create_file',
      description:
        'Create a brand-new file with the given content. Only use this when the file does NOT exist yet. Use "edit" to modify existing files.',
      schema: z.object({
        filePath: z.string().describe('File path relative to the repo root (e.g. "src/utils/helper.ts")'),
        content: z.string().describe('The full content to write into the new file'),
      }),
    }
  );
}
