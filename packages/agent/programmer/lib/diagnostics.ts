export const GRAPH_DIAGNOSTIC_EVENT = "graph_diagnostic";

export type GraphDiagnosticStatus = "started" | "completed" | "failed";

export interface GraphDiagnostic {
  node: "prepare-sandbox" | "create-empty-pr";
  operation: string;
  status: GraphDiagnosticStatus;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: unknown;
}

export function emitGraphDiagnostic(diagnostic: GraphDiagnostic): void {
  const payload = {
    type: GRAPH_DIAGNOSTIC_EVENT,
    ...diagnostic,
    timestamp: new Date().toISOString(),
  };

  console.info("[langgraph]", payload);
}

export function errorDetails(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }

  return { name: "UnknownError", message: String(error) };
}
