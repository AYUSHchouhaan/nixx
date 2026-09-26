import path from "node:path";
import type { Sandbox } from "@daytonaio/sdk";
import type { SandboxExecutionResult } from "./types";

const PREVIEW_SESSION_ID = "nixx-preview";
const HEALTH_CHECK_TIMEOUT_MS = 60_000;
const HEALTH_CHECK_INTERVAL_MS = 1_000;

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parsePort(value: unknown): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Preview port must be an integer between 1 and 65535");
  }
  return port;
}

function previewOutput(value: unknown): string {
  return JSON.stringify(value);
}

async function portIsHealthy(sandbox: Sandbox, port: number, cwd: string): Promise<boolean> {
  const response = await sandbox.process.executeCommand(
    `curl --silent --output /dev/null http://127.0.0.1:${port}`,
    cwd,
    undefined,
    10,
  );
  return response.exitCode === 0;
}

async function waitForPort(
  sandbox: Sandbox,
  port: number,
  cwd: string,
): Promise<boolean> {
  const deadline = Date.now() + HEALTH_CHECK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await portIsHealthy(sandbox, port, cwd)) return true;
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
  }
  return false;
}

async function getPreviewSession(sandbox: Sandbox) {
  const sessions = await sandbox.process.listSessions();
  return sessions.find((session) => session.sessionId === PREVIEW_SESSION_ID);
}

export async function startPreview(
  sandbox: Sandbox,
  repoDir: string,
  args: Record<string, unknown>,
): Promise<SandboxExecutionResult> {
  try {
    const command = String(args.command ?? "").trim();
    if (!command) throw new Error("Preview command is required");

    const port = parsePort(args.port);
    const cwdValue = typeof args.cwd === "string" && args.cwd.trim() ? args.cwd.trim() : ".";
    const cwd = path.posix.resolve(repoDir, cwdValue.replaceAll("\\", "/"));
    const repoRoot = path.posix.resolve(repoDir);
    if (cwd !== repoRoot && !cwd.startsWith(`${repoRoot}/`)) {
      throw new Error("Preview cwd must stay inside the repository");
    }

    const existingSession = await getPreviewSession(sandbox);
    if (existingSession && (await portIsHealthy(sandbox, port, cwd))) {
      const preview = await sandbox.getSignedPreviewUrl(port, 3600);
      return {
        output: previewOutput({
          status: "running",
          sessionId: PREVIEW_SESSION_ID,
          port,
          url: preview.url,
        }),
        exitCode: 0,
      };
    }

    if (existingSession) {
      await sandbox.process.deleteSession(PREVIEW_SESSION_ID);
    }

    await sandbox.process.createSession(PREVIEW_SESSION_ID);
    const sessionCommand = await sandbox.process.executeSessionCommand(
      PREVIEW_SESSION_ID,
      {
        command: `cd ${shellQuote(cwd)} && ${command}`,
        runAsync: true,
      },
    );

    if (!(await waitForPort(sandbox, port, cwd))) {
      const logs = await sandbox.process.getSessionCommandLogs(
        PREVIEW_SESSION_ID,
        sessionCommand.cmdId,
      );
      await sandbox.process.deleteSession(PREVIEW_SESSION_ID).catch(() => undefined);
      return {
        output: previewOutput({
          status: "failed",
          port,
          error: "The preview server did not start listening on the requested port",
          logs: logs.output ?? [logs.stdout, logs.stderr].filter(Boolean).join("\n"),
        }),
        exitCode: 1,
        error: "Preview server health check timed out",
      };
    }

    const preview = await sandbox.getSignedPreviewUrl(port, 3600);
    return {
      output: previewOutput({
        status: "running",
        sessionId: PREVIEW_SESSION_ID,
        port,
        url: preview.url,
      }),
      exitCode: 0,
    };
  } catch (error) {
    return {
      output: previewOutput({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      }),
      exitCode: 1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function stopPreview(
  sandbox: Sandbox,
): Promise<SandboxExecutionResult> {
  try {
    const session = await getPreviewSession(sandbox);
    if (session) await sandbox.process.deleteSession(PREVIEW_SESSION_ID);
    return {
      output: previewOutput({
        status: "stopped",
        sessionId: PREVIEW_SESSION_ID,
      }),
      exitCode: 0,
    };
  } catch (error) {
    return {
      output: "",
      exitCode: 1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
