export const SANDBOX_COMMANDS = {
  readFile: "read_file",
  glob: "glob",
  grep: "grep",
  run: "run_command",
  createFile: "create_file",
  editFile: "edit_file",
  git: "git",
} as const;

export type SandboxCommandName =
  (typeof SANDBOX_COMMANDS)[keyof typeof SANDBOX_COMMANDS];

export interface SandboxProvisionInput {
  threadId: string;
  conversationId: string;
  sandboxId: string;
  repoUrl: string;
  branch?: string;
  installationToken: string;
}

export interface SandboxProvisionResult {
  sandboxId: string;
  sandboxPath: string;
  cloned: boolean;
  error?: string;
}

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

export interface SandboxProvisionMessage extends SandboxProvisionInput {
  type: "provision";
  commandId: string;
}

export interface SandboxProvisionResultMessage
  extends SandboxProvisionResult {
  type: "provision_result";
  commandId: string;
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
