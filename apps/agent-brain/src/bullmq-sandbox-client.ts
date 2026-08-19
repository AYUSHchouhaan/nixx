import { randomUUID } from "node:crypto";
import {
  agentToSandboxQueue,
  type SandboxCallInput,
  type SandboxCallResult,
  type SandboxClient,
  type SandboxCommandMessage,
  type SandboxProvisionInput,
  type SandboxProvisionMessage,
  type SandboxProvisionResult,
} from "@repo/contracts";
import {
  registerPendingCall,
  rejectPendingCall,
  registerPendingProvision,
  rejectPendingProvision,
} from "./pending-calls";

const CALL_TIMEOUT_MS = 120_000;

export class BullMqSandboxClient implements SandboxClient {
  async call(input: SandboxCallInput): Promise<SandboxCallResult> {
    const commandId = randomUUID();

    const message: SandboxCommandMessage = {
      type: "command",
      commandId,
      ...input,
    };

    return new Promise<SandboxCallResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        rejectPendingCall(commandId, new Error(`Sandbox timeout for command ${commandId}`));
      }, CALL_TIMEOUT_MS);

      registerPendingCall(commandId, { resolve, reject, timer });

      void agentToSandboxQueue.add("command", message).catch((err) => {
        rejectPendingCall(commandId, err);
      });
    });
  }

  async provision(input: SandboxProvisionInput): Promise<SandboxProvisionResult> {
    const commandId = randomUUID();

    const message: SandboxProvisionMessage = {
      type: "provision",
      commandId,
      ...input,
    };

    return new Promise<SandboxProvisionResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        rejectPendingProvision(commandId, new Error(`Sandbox provision timeout for command ${commandId}`));
      }, CALL_TIMEOUT_MS);

      registerPendingProvision(commandId, { resolve, reject, timer });

      void agentToSandboxQueue.add("provision", message).catch((err) => {
        rejectPendingProvision(commandId, err);
      });
    });
  }
}
