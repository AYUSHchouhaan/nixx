import "dotenv/config";
import { Daytona } from "@daytonaio/sdk";
import {
  DEFAULT_SANDBOX_CREATE_PARAMS,
  DAYTONA_SNAPSHOT_NAME,
  SANDBOX_ROOT_DIR,
} from "../src/daytona";

async function main() {
  if (!process.env.DAYTONA_API_KEY) {
    throw new Error("DAYTONA_API_KEY is required");
  }

  const daytona = new Daytona();

  const name = `nixx-smoke-${Date.now()}`;
  console.log(`Creating sandbox "${name}" (snapshot: ${DAYTONA_SNAPSHOT_NAME})...`);

  const sandbox = await daytona.create({
    ...DEFAULT_SANDBOX_CREATE_PARAMS,
    name,
  });

  console.log("Sandbox created:", sandbox.id, `state=${sandbox.state}`);

  try {
    // Verify the sandbox environment matches sandbox/Dockerfile.
    const response = await sandbox.process.executeCommand(
      "whoami && pwd && node --version && rg --version",
      SANDBOX_ROOT_DIR,
    );
    const output = (response.result ?? "").trim();
    console.log("Environment check:\n" + output + "\n");

    const lines = output.split("\n");
    const user = lines[0] ?? "";
    const workdir = lines[1] ?? "";
    if (user !== "daytona") {
      throw new Error(`Expected user "daytona", got: "${user}"`);
    }
    if (workdir !== SANDBOX_ROOT_DIR) {
      throw new Error(`Expected working directory ${SANDBOX_ROOT_DIR}, got: "${workdir}"`);
    }
    if (!output.includes("v22.")) {
      throw new Error(`Expected Node.js 22, got:\n${output}`);
    }
    if (!output.includes("ripgrep")) {
      throw new Error(`Expected ripgrep, got:\n${output}`);
    }

    console.log("✅ Sandbox creation + environment test passed");
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
  