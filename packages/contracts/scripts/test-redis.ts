import "dotenv/config";
import { Queue } from "bullmq";
import { QUEUE_NAMES, redisConnection } from "../src/config";

const TEST_QUEUE = `${QUEUE_NAMES.agentToSandbox}-test`;
const TEST_PAYLOAD = { ping: "pong", at: Date.now() };
const CONNECT_TIMEOUT_MS = 10_000;

async function main() {
  console.log(
    `Connecting to Redis at ${redisConnection.host}:${redisConnection.port}...`,
  );

  const queue = new Queue(TEST_QUEUE, { connection: redisConnection });

  // 1. Connectivity + reachability, with a hard deadline so a missing Redis
  //    fails fast instead of hanging (BullMQ retries forever on its own).
  await Promise.race([
    queue.waitUntilReady(),
    new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Could not reach Redis at ${redisConnection.host}:${redisConnection.port} within ${CONNECT_TIMEOUT_MS}ms — is it running?`,
            ),
          ),
        CONNECT_TIMEOUT_MS,
      ),
    ),
  ]);
  console.log("Redis version:", queue.redisVersion);

  // 2. Enqueue a test job and confirm BullMQ can write/read it.
  const job = await queue.add("smoke", TEST_PAYLOAD);
  const fetched = await queue.getJob(job.id!);
  console.log(
    "BullMQ round-trip:",
    fetched ? "OK" : "FAILED",
    `(job id ${job.id})`,
  );

  // 3. Clean up the test job and queue so we don't pollute real queues.
  await job.remove();
  await queue.obliterate({ force: true });
  await queue.close();

  console.log("✅ Redis/BullMQ connection test passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(
    "❌ Redis/BullMQ connection test failed:",
    e instanceof Error ? e.message : String(e),
  );
  process.exit(1);
});
