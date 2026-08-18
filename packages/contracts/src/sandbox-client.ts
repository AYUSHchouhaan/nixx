import type { SandboxCallInput, SandboxCallResult } from "./messages";

export interface SandboxClient {
  call(input: SandboxCallInput): Promise<SandboxCallResult>;
}
