export const SANDBOX_COMMANDS = {
  readFile: "read_file",
  glob: "glob",
  grep: "grep",
  run: "run_command",
} as const;

export type SandboxCommandName =
  (typeof SANDBOX_COMMANDS)[keyof typeof SANDBOX_COMMANDS];

export interface SandboxCallInput {
  threadId: string;
  conversationId: string;
  sandboxId: string;
  command: SandboxCommandName;
  args: Record<string, unknown>;
}

export interface SandboxCallResult {
  output: string;
  exitCode: number;
  error?: string;
}

export interface SandboxCommandMessage extends SandboxCallInput {
  type: "command";
  commandId: string;
}

export interface SandboxResultMessage {
  type: "result";
  commandId: string;
  threadId: string;
  conversationId: string;
  sandboxId: string;
  output: string;
  exitCode: number;
  error?: string;
}
