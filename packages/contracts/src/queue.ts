import { Queue } from "bullmq";

export const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export const QUEUE_NAMES = {
  agentToSandbox: "agent-to-sandbox",  // Queue A: agent → sandbox
  sandboxToAgent: "sandbox-to-agent",  // Queue B: sandbox → agent
};

export const agentToSandboxQueue = new Queue(QUEUE_NAMES.agentToSandbox, { connection });
export const sandboxToAgentQueue = new Queue(QUEUE_NAMES.sandboxToAgent, { connection });