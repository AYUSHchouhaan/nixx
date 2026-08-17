import { randomUUID } from "node:crypto";
import type { SandboxClient, SandboxCallResult } from "@repo/contracts";
import { agentToSandboxQueue } from "@repo/contracts";
import { registerPendingCall } from "./result-consumer.js";

export class BullMqSandboxClient implements SandboxClient {
  async call(input: {
    sandboxId: string;
    command: string;
    args: Record<string, unknown>;
  }): Promise<SandboxCallResult> {
    const commandId = randomUUID();

    // SEND → Queue A
    await agentToSandboxQueue.add("tool", {
      type: "tool",
      commandId,
      sandboxId: input.sandboxId,
      command: input.command,
      args: input.args,
    });

    // WAIT → result-consumer will resolve this
    return new Promise<SandboxCallResult>((resolve, reject) => {
      registerPendingCall(commandId, resolve);
      setTimeout(
        () => reject(new Error(`Sandbox timeout for command ${commandId}`)),
        120_000,
      ).unref();
    });
  }
}