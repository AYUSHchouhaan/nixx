import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { emitAgent } from '../ui/events';

/**
 * Creates an edit tool that applies one or more string-replacements on an existing file.
 * For creating new files, use the "create_file" tool instead.
 */
export function createEditTool(repoPath: string) {
  return tool(
    async ({filePath,edits,}: {filePath: string;edits: Array<{ oldStr: string; newStr: string }>;
    }) => {
      try {
        const fullPath = path.join(repoPath, filePath);

        if (!fs.existsSync(fullPath)) {
          return `Error: "${filePath}" does not exist. Use the "create_file" tool to create new files.`;
        } 

        let content = fs.readFileSync(fullPath, 'utf-8');
        const originalContent = content;

        for (let i = 0; i < edits.length; i++) {
          const edit = edits[i];
          if (!edit) continue;
          let { oldStr, newStr } = edit;

          // Try exact match first
          if (!content.includes(oldStr)) {
            // Try normalizing line endings: convert CRLF to LF in both content and oldStr
            const normalizedContent = content.replace(/\r\n/g, '\n');
            const normalizedOldStr = oldStr.replace(/\r\n/g, '\n');
            
            if (normalizedContent.includes(normalizedOldStr)) {
              // Line ending mismatch detected - use normalized versions
              content = normalizedContent;
              oldStr = normalizedOldStr;
              newStr = newStr.replace(/\r\n/g, '\n');
            } else {
              // Still not found - emit what we tried and provide debugging info
              emitAgent({
                type: 'edit_detail',
                filePath,
                index: i + 1,
                total: edits.length,
                oldStr,
                newStr,
              });
              
              // Provide debugging suggestions
              const lines = content.split('\n');
              const keywords = oldStr.split(/[\s\n,{}[\]()]+/).filter(w => w.length > 4).slice(0, 3);
              const matchingLines = lines
                .map((line, idx) => ({ line, idx, score: keywords.filter(k => line.includes(k)).length }))
                .filter(l => l.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 2);

              const suggestion = matchingLines.length > 0
                ? `Found similar lines at: ${matchingLines.map(m => `line ${m.idx + 1}`).join(', ')}`
                : 'No similar content found. Check for: quote type differences (single vs double), whitespace/indentation, or incomplete matches.';

              return `Error: edits[${i}] oldStr not found in "${filePath}". ${suggestion}`;
            }
          }

          // Emit edit detail event to show what's being changed
          emitAgent({
            type: 'edit_detail',
            filePath,
            index: i + 1,
            total: edits.length,
            oldStr,
            newStr,
          });

          content = content.replace(oldStr, newStr);
        }

        fs.writeFileSync(fullPath, content, 'utf-8');
        return `Successfully applied ${edits.length} edit(s) to "${filePath}".`;
      } catch (error) {
        return `Error editing "${filePath}": ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'edit',
      description:
        'Edit one existing file by applying an ordered list of {oldStr, newStr} replacements. For each item, oldStr must match exactly (including whitespace). Automatically handles Windows (CRLF) vs Unix (LF) line ending differences. dont give replacement of whole file content, only give the part that needs to be changed. for a single file where you want to edit multiple parts, provide an array of edits in the order they should be applied. and make sure old str is in the file content.',
      schema: z.object({
        filePath: z.string().describe('Path to an existing file, relative to the repository root'),
        edits: z.array(
            z.object({
              oldStr: z.string().describe('Exact text to find in the current file content (case and whitespace sensitive). Include full newlines for multi-line content.'),
              newStr: z.string().describe('Text to replace the first matched oldStr occurrence'),
            })
          )
          .min(1)
          .describe('Ordered replacements applied sequentially to the same file'),
      }),
    }
  );
}
