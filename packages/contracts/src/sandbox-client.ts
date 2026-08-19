import type {
  SandboxCallInput,
  SandboxCallResult,
  SandboxProvisionInput,
  SandboxProvisionResult,
} from "./messages";

export interface SandboxClient {
  call(input: SandboxCallInput): Promise<SandboxCallResult>;
  provision(input: SandboxProvisionInput): Promise<SandboxProvisionResult>;
}
