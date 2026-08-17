import { Worker } from "bullmq";
import { connection, sandboxToAgentQueue } from "@repo/contracts";

type Resolve = (value: { output: string; exitCode: number }) => void;

// commandId → the resolve fn of the waiting tool call
const pending = new Map<string, Resolve>();

export function registerPendingCall(commandId: string, resolve: Resolve) {
  pending.set(commandId, resolve);
}

export function startResultConsumer() {
  new Worker(
    QUEUE_NAMES.sandboxToAgent,
    async (job) => {
      const { commandId, output, exitCode } = job.data;
      const resolve = pending.get(commandId);
      if (resolve) {
        pending.delete(commandId);
        resolve({ output, exitCode });   // ← wakes up the tool's await
      }
    },
    { connection },
  );
}