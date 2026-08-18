export const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
};

export const QUEUE_NAMES = {
  agentToSandbox: "agent-to-sandbox",
  sandboxToAgent: "sandbox-to-agent",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
