export interface SandboxCallInput {
  sandboxId: string;
  command: string;                 // "read_file" | "write_file" | "edit_file" | "run"
  args: Record<string, unknown>;
}

export interface SandboxCallResult {
  output: string;
  exitCode: number;
}

export interface SandboxClient {
  call(input: SandboxCallInput): Promise<SandboxCallResult>;
}