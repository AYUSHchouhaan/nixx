import "dotenv/config";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { createProgrammerGraph } from "@repo/agent";
import { BullMqSandboxClient } from "./bullmq-sandbox-client";
import { startResultConsumer } from "./result-consumer";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to start the LangGraph server");
}

startResultConsumer();

const checkpointer = PostgresSaver.fromConnString(databaseUrl);
await checkpointer.setup();

export const graph = createProgrammerGraph({
  sandboxClient: new BullMqSandboxClient(),
  checkpointer,
});