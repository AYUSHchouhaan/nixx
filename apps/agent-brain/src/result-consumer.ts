import { Worker } from "bullmq";
import {
  QUEUE_NAMES,
  redisConnection,
  type SandboxProvisionResultMessage,
  type SandboxResultMessage,
} from "@repo/contracts";
import {
  resolvePendingCall,
  rejectPendingCall,
  resolvePendingProvision,
  rejectPendingProvision,
} from "./pending-calls";

export function startResultConsumer() {
  const worker = new Worker(
    QUEUE_NAMES.sandboxToAgent,
    async (job) => {
      const data = job.data as SandboxResultMessage | SandboxProvisionResultMessage;

      if (data.type === "provision_result") {
        resolvePendingProvision(data.commandId, {
          sandboxId: data.sandboxId,
          sandboxPath: data.sandboxPath,
          cloned: data.cloned,
          error: data.error,
        });
        return;
      }

      resolvePendingCall(data.commandId, {
        output: data.output,
        exitCode: data.exitCode,
        error: data.error,
      });
    },
    { connection: redisConnection },
  );

  worker.on("failed", (job, err) => {
    const data = job?.data as
      | SandboxResultMessage
      | SandboxProvisionResultMessage
      | undefined;

    if (!data?.commandId) return;

    if (data.type === "provision_result") {
      rejectPendingProvision(data.commandId, err);
      return;
    }

    rejectPendingCall(data.commandId, err);
  });

  return worker;
}
