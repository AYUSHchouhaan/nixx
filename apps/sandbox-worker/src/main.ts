import { Worker } from "bullmq";
import {
  QUEUE_NAMES,
  redisConnection,
  sandboxToAgentQueue,
  type SandboxCommandMessage,
  type SandboxProvisionMessage,
  type SandboxProvisionResultMessage,
  type SandboxResultMessage,
} from "@repo/contracts";
import { executeSandboxCommand } from "./executor";
import { provisionSandbox, resolveSandboxPath } from "./provision";

const sandboxRoot = process.env.SANDBOX_ROOT ?? process.cwd();

const worker = new Worker(
  QUEUE_NAMES.agentToSandbox,
  async (job) => {
    const data = job.data as SandboxCommandMessage | SandboxProvisionMessage;

    if (data.type === "provision") {
      const result = await provisionSandbox(sandboxRoot, {
        sandboxId: data.sandboxId,
        repoUrl: data.repoUrl,
        branch: data.branch,
        installationToken: data.installationToken,
      });

      const message: SandboxProvisionResultMessage = {
        type: "provision_result",
        commandId: data.commandId,
        ...result,
      };

      await sandboxToAgentQueue.add("provision_result", message);
      return;
    }

    const sandboxPath = resolveSandboxPath(sandboxRoot, data.sandboxId);
    const result = await executeSandboxCommand(
      sandboxPath,
      data.command,
      data.args,
    );

    const message: SandboxResultMessage = {
      type: "result",
      commandId: data.commandId,
      threadId: data.threadId,
      conversationId: data.conversationId,
      sandboxId: data.sandboxId,
      output: result.output,
      exitCode: result.exitCode,
      error: result.error,
    };

    await sandboxToAgentQueue.add("result", message);
  },
  { connection: redisConnection },
);

console.log(`Sandbox worker started (root: ${sandboxRoot})`);
