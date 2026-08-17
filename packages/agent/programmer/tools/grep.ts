import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Creates a grep tool backed by ripgrep (rg) for fast codebase search.
 * Supports multiple keywords via pipe syntax: "createUser| "
 * Returns up to 5 unique relative file paths. Skips common build/dep dirs.
 */
export function createGrepTool(repoPath: string) {
  return tool(
    async ({ query }: { query: string }) => {
      try {
        const { stdout } = await execFileAsync(
          'rg',
          [
            '--ignore-case',
            '--files-with-matches',   // only print file paths
            '--max-count', '3',       // stop after first match per file
            '--glob', '!node_modules',
            '--glob', '!.git',
            '--glob', '!.next',
            '--glob', '!dist',
            '--glob', '!build',
            '--glob', '!out',
            '--glob', '!.turbo',
            '--glob', '!.vercel',
            '--glob', '!vendor',
            '--glob', '!.cache',
            '--glob', '!__pycache__',
            '-e', query,              // supports "word1|word2" alternation natively
            '.',
          ],
          { maxBuffer: 10 * 1024 * 1024, cwd: repoPath }
        );

        const allFiles = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((f) => f.replace(/\\/g, '/').replace(/^\.\//,  ''));

        const files = allFiles.slice(0, 5);

        if (files.length === 0) {
          return `No files found matching "${query}".`;
        }
        return `Found ${files.length} file(s) matching "${query}":\n${files.join('\n')}`;
      } catch (err: any) {
        // rg exits with code 1 when no matches found (not an error)
        if (err.code === 1) {
          return `No files found matching "${query}".`;
        }
        // rg not installed or other error
        return `grep tool error: ${err.message ?? String(err)}`;
      }
    },
    {
      name: 'grep',
      description:
        'Fast codebase search using ripgrep. Supports multiple keywords with pipe: "createUser|updateUser". Returns up to 5 matching file paths. Skips node_modules, .git, dist, etc.',
      schema: z.object({
        query: z
          .string()
          .describe('Search term(s) to find in files. Use pipe for multiple: "termA|termB"'),
      }),
    }
  );
}
