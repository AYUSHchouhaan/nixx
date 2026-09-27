import "dotenv/config";
import { fileURLToPath } from "node:url";
import { Daytona, Image } from "@daytonaio/sdk";
import type { Resources } from "@daytonaio/sdk";
import { DAYTONA_SNAPSHOT_NAME } from "../src/daytona";

const RESOURCES: Resources = { cpu: 2, memory: 4, disk: 8 };

const dockerfilePath = fileURLToPath(
  new URL("../sandbox/Dockerfile", import.meta.url),
);

async function main() {
  if (!process.env.DAYTONA_API_KEY) {
    throw new Error("DAYTONA_API_KEY is required");
  }

  const daytona = new Daytona();

  console.log(
    `Creating snapshot "${DAYTONA_SNAPSHOT_NAME}" from ${dockerfilePath}`,
  );

  const snapshot = await daytona.snapshot.create(
    {
      name: DAYTONA_SNAPSHOT_NAME,
      image: Image.fromDockerfile(dockerfilePath),
      resources: RESOURCES,
    },
    { onLogs: (chunk) => process.stdout.write(chunk + "\n"), timeout: 1800 },
  );

  console.log(
    `Snapshot "${snapshot.name}" is ${snapshot.state} (image: ${snapshot.imageName}, cpu: ${snapshot.cpu}, mem: ${snapshot.mem}GiB, disk: ${snapshot.disk}GiB)`,
  );
}

main().catch((error) => {
  console.error(
    "Snapshot build failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
