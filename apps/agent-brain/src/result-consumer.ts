import { Worker } from "bullmq";
import {
  QUEUE_NAMES,
  redisConnection,
  type SandboxResultMessage,
} from "@repo/contracts";
import { resolvePendingCall, rejectPendingCall } from "./pending-calls";

export function startResultConsumer() {
  const worker = new Worker(
    QUEUE_NAMES.sandboxToAgent,
    async (job) => {
      const data = job.data as SandboxResultMessage;
      resolvePendingCall(data.commandId, {
        output: data.output,
        exitCode: data.exitCode,
        error: data.error,
      });
    },
    { connection: redisConnection },
  );

  worker.on("failed", (job, err) => {
    const data = job?.data as SandboxResultMessage | undefined;
    if (data?.commandId) {
      rejectPendingCall(data.commandId, err);
    }
  });

  return worker;
}
