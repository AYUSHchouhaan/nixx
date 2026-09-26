import { tool } from "@langchain/core/tools";
import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { sandboxCall } from "./helpers";
import type { ProgrammerGraphDeps } from "../types";

const previewResultSchema = z.object({
  status: z.string(),
  port: z.number().optional(),
  url: z.string().url().optional(),
  sessionId: z.string().optional(),
  error: z.string().optional(),
  logs: z.string().optional(),
});

function formatPreviewResult(output: string, fallbackError?: string): string {
  try {
    const result = previewResultSchema.parse(JSON.parse(output));
    if (result.status === "running" && result.url && result.port) {
      return `Preview is running on port ${result.port}: ${result.url}`;
    }
    if (result.status === "stopped") {
      return "Preview server stopped.";
    }
    return [
      `Preview failed: ${result.error ?? fallbackError ?? "unknown error"}`,
      result.logs ? `Server logs:\n${result.logs}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return fallbackError ?? output;
  }
}

export function createStartPreviewTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (
      args: { command: string; port: number; cwd?: string },
      config: RunnableConfig,
    ) => {
      const result = await sandboxCall(deps, config, "start_preview", args);
      return formatPreviewResult(result.output, result.error);
    },
    {
      name: "start_preview",
      description:
        "Start or reuse a web server inside the repository sandbox and return a Daytona preview URL. Decide the command and port from the repository. The server must bind to 0.0.0.0, for example: npm run dev -- --host 0.0.0.0 --port 3000. Do not install dependencies automatically unless you first use run. If startup fails, inspect the returned logs and fix the project before retrying.",
      schema: z.object({
        command: z.string().min(1).describe("Server startup command."),
        port: z.number().int().min(1).max(65535).describe("HTTP port the server will listen on."),
        cwd: z.string().optional().describe("Repository-relative working directory."),
      }),
    },
  );
}

export function createStopPreviewTool(deps: ProgrammerGraphDeps) {
  return tool(
    async (_args: Record<string, never>, config: RunnableConfig) => {
      const result = await sandboxCall(deps, config, "stop_preview", {});
      return formatPreviewResult(result.output, result.error);
    },
    {
      name: "stop_preview",
      description: "Stop the currently running preview server in the repository sandbox.",
      schema: z.object({}),
    },
  );
}
