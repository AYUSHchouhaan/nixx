import { Queue } from "bullmq";
import { QUEUE_NAMES, redisConnection } from "./config";

export const agentToSandboxQueue = new Queue(QUEUE_NAMES.agentToSandbox, {
  connection: redisConnection,
});

export const sandboxToAgentQueue = new Queue(QUEUE_NAMES.sandboxToAgent, {
  connection: redisConnection,
});
