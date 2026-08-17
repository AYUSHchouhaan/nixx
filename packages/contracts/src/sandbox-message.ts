// What the agent sends on Queue A
export interface SandboxCommandMessage {
  type: "tool";
  commandId: string;               // correlation id
  tenantId: string;
  threadId: string;
  sandboxId: string;
  command: string;
  args: Record<string, unknown>;
}

// What the worker sends back on Queue B
export interface SandboxResultMessage {
  type: "result";
  commandId: string;               // same id as the request
  sandboxId: string;
  output: string;
  exitCode: number;
  error?: string;
} 