import "dotenv/config";
import { Daytona } from "@daytonaio/sdk";
import {
  DEFAULT_SANDBOX_CREATE_PARAMS,
  DAYTONA_IMAGE_NAME,
} from "../src/daytona";

async function main() {
  if (!process.env.DAYTONA_API_KEY) {
    throw new Error("DAYTONA_API_KEY is required");
  }

  const daytona = new Daytona();

  const name = `nixx-smoke-${Date.now()}`;
  console.log(`Creating sandbox "${name}" (snapshot: ${DAYTONA_IMAGE_NAME})...`);

  const sandbox = await daytona.create({
    ...DEFAULT_SANDBOX_CREATE_PARAMS,
    name,
  });

  console.log("Sandbox created:", sandbox.id, `state=${sandbox.state}`);

  try {
    // Verify the sandbox is actually usable by running a command inside it.
    const response = await sandbox.process.executeCommand("echo nixx-ok");
    const output = (response.result ?? "").trim();
    console.log("Command output:", output);

    if (output !== "nixx-ok") {
      throw new Error(`Unexpected sandbox output: "${output}"`);
    }

    console.log("✅ Sandbox creation + execution test passed");
  } finally {
    console.log("Deleting test sandbox...");
    await daytona.delete(sandbox, 60, true).catch((e) => {
      console.warn(
        "Could not delete test sandbox (cleanup):",
        e instanceof Error ? e.message : String(e),
      );
    });
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(
    "❌ Sandbox test failed:",
    e instanceof Error ? e.message : String(e),
  );
  process.exit(1);
});
