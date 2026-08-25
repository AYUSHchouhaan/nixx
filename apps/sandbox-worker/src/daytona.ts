import { Daytona } from "@daytonaio/sdk";
import type { CreateSandboxFromSnapshotParams } from "@daytonaio/sdk";

export const DAYTONA_IMAGE_NAME = "daytonaio/langchain-open-swe:0.1.0";
export const DAYTONA_SNAPSHOT_NAME = "daytona-small";
export const SANDBOX_ROOT_DIR = "/home/daytona";

export const DEFAULT_SANDBOX_CREATE_PARAMS: CreateSandboxFromSnapshotParams = {
  user: "daytona",
  snapshot: DAYTONA_SNAPSHOT_NAME,
  autoStopInterval: 15,
  autoDeleteInterval: 0,
};

let daytonaInstance: Daytona | null = null;

export function daytonaClient(): Daytona {
  if (!daytonaInstance) {
    daytonaInstance = new Daytona();
  }
  return daytonaInstance;
}
