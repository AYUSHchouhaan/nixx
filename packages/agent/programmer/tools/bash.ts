import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { spawn } from 'child_process';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

function makeRollingBuffer(maxChars = 64 * 1024) {
  let buf = '';
  let truncated = false;
  return {
    append(chunk: string) {
      buf += chunk;
      if (buf.length > maxChars) {
        // keep last maxChars
        buf = buf.slice(-maxChars);
        truncated = true;
      }
    },
    toString() {
      return truncated ? `${buf}\n...[truncated]` : buf;
    },
  };
}

async function resolvePathIfPossible(repoPath: string, token: string) {
  try {
    const resolved = path.isAbsolute(token) ? token : path.resolve(repoPath, token);
    const real = await fsPromises.realpath(resolved);
    return real;
  } catch {
    return null;
  }
}

export function createBashTool(repoPath: string) {
  return tool(
    async ({ command, timeoutMs }: { command: string; timeoutMs?: number }) => {
      const trimmed = String(command ?? '').trim();
      if (!trimmed) return 'bash tool error: command is empty.';

      const timeout = Math.max(1000, Math.min(timeoutMs ?? 12000, 60000));

      // Attempt to detect file-like tokens to resolve real paths (best-effort)
      const pathTokenRegex = /(?:\.{1,2}\/|[A-Za-z]:\\|\\|\/)[^\s;|&]*/g;
      const candidates = Array.from(trimmed.matchAll(pathTokenRegex)).map((m) => m[0]);
      const resolved: string[] = [];
      for (const tok of candidates) {
        const rp = await resolvePathIfPossible(repoPath, tok);
        if (rp) resolved.push(rp);
      }

      const externalPaths = resolved.filter((r) => !r.startsWith(path.resolve(repoPath)));
      let permissionWarning = '';
      if (externalPaths.length > 0) {
        permissionWarning = `WARNING: command touches external paths:\n${externalPaths.slice(0, 5).join('\n')}\n`;
      }

      // Choose a shell. On Windows prefer powershell; on other platforms use /bin/sh
      const shellName = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';

      // Spawn with shell for proper parsing of chained commands
      const child = spawn(trimmed, {
        cwd: repoPath,
        shell: shellName,
        detached: process.platform !== 'win32',
      });

      const stdoutBuf = makeRollingBuffer();
      const stderrBuf = makeRollingBuffer();

      let exited = false;
      let exitCode: number | null = null;
      let signal: NodeJS.Signals | null = null;

      child.stdout?.on('data', (d: Buffer) => {
        const s = d.toString('utf8');
        stdoutBuf.append(s);
      });

      child.stderr?.on('data', (d: Buffer) => {
        const s = d.toString('utf8');
        stderrBuf.append(s);
      });

      const killChildTree = async (pid?: number) => {
        if (!pid) return;
        try {
          if (process.platform === 'win32') {
            // taskkill /PID <pid> /T /F
            const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F']);
            await new Promise((res) => killer.on('exit', res));
          } else {
            // kill process group
            process.kill(-pid, 'SIGKILL');
          }
        } catch (_) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch (_) {
            /* ignore */
          }
        }
      };

      const timer = setTimeout(() => {
        if (!exited) {
          // timeout — kill tree
          void killChildTree(child.pid || undefined);
        }
      }, timeout);

      const result = await new Promise<string>((resolve) => {
        child.on('error', (err) => {
          clearTimeout(timer);
          resolve(`${permissionWarning}bash spawn error: ${String(err?.message ?? err)}`);
        });

        child.on('exit', (code, sig) => {
          exited = true;
          exitCode = code;
          signal = sig;
          clearTimeout(timer);
          const out = stdoutBuf.toString().trim();
          const err = stderrBuf.toString().trim();
          const parts: string[] = [];
          if (permissionWarning) parts.push(permissionWarning.trim());
          if (out) parts.push(`stdout:\n${out}`);
          if (err) parts.push(`stderr:\n${err}`);
          parts.push(`exitCode: ${code ?? 'null'}${sig ? `, signal: ${sig}` : ''}`);
          resolve(parts.join('\n\n'));
        });
      });

      return result;
    },
    {
      name: 'bash',
      description:
        'Run a single command in the repository root. Streams stdout/stderr and enforces a timeout. On Windows this uses PowerShell; on Unix it uses /bin/sh. The tool will attempt to detect file paths and warn if they resolve outside the repo.',
      schema: z.object({
        command: z.string().describe('Shell command to execute. Example: "ls -la", "cd src; npm run build"'),
        timeoutMs: z.number().int().min(1000).max(60000).optional().describe('Optional execution timeout in milliseconds; clamped to 1000-60000. Default is 12000.'),
      }),
    }
  );
}
