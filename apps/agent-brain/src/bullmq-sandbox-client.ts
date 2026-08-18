import { randomUUID } from "node:crypto";
import {
  agentToSandboxQueue,
  type SandboxCallInput,
  type SandboxCallResult,
  type SandboxClient,
  type SandboxCommandMessage,
} from "@repo/contracts";
import { registerPendingCall, rejectPendingCall } from "./pending-calls";

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
}
