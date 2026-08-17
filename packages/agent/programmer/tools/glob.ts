import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const EXCLUDE_GLOBS = [
  '!**/node_modules/**',
  '!**/.git/**',
  '!**/.next/**',
  '!**/dist/**',
  '!**/build/**',
  '!**/.turbo/**',
  '!**/.vercel/**',
  '!**/.cache/**',
];

export function createGlobTool(repoPath: string) {
  return tool(
    async ({ patterns }: { patterns: string[] }) => {
      // Build glob args from user patterns first.
      const userGlobs = patterns.flatMap((p) => ['--glob', p]);
      // Apply hard excludes last so they always win.
      const hardExcludeGlobs = EXCLUDE_GLOBS.flatMap((g) => ['--glob', g]);

      try {
        const { stdout } = await execFileAsync(
          'rg',
          [
            '--files',
            ...userGlobs,
            ...hardExcludeGlobs,
            '.',
          ],
          { maxBuffer: 10 * 1024 * 1024, cwd: repoPath }
        );

        const files = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((f) => f.replace(/\\/g, '/').replace(/^\.\//,  ''));

        if (files.length === 0) {
          return `No files found matching: ${patterns.join(', ')}`;
        }

        return `file matching ${files.join('\n')}`;
      } catch (err: any) {
        // rg exits with code 1 when no files match — not an error
        if (err.code === 1) {
          return `No files found matching: ${patterns.join(', ')}`;
        }
        return `glob tool error: ${err.message ?? String(err)}`;
      }
    },
    {
      name: 'glob',
      description:
        'Find files by path pattern. Provide up to 7 glob patterns such as "**/src/**/*.ts" or "**/*.js" to locate files without reading contents. Always excludes noisy directories like node_modules, .git, dist, and build.',
      schema: z.object({
        patterns: z
          .array(z.string())
          .min(1)
          .max(7)
          .describe(
            'Up to 7 glob patterns. Always use **/ prefix for directory names, e.g. ["**/src/**/*.ts", "**/components/**/*.tsx", "**/*.js"]. Use ** for recursive matching at any depth.'
          ),
      }),
    }
  );
}
