import path from "node:path";
import type { Sandbox } from "@daytonaio/sdk";
import { absolutePath } from "./path-utils";

export async function createFile(
  sandbox: Sandbox,
  repoDir: string,
  filePath: string,
  content: string,
): Promise<string> {
  try {
    const fullPath = absolutePath(repoDir, filePath);

    let exists = false;
    try {
      await sandbox.fs.getFileDetails(fullPath);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      return `Error: "${filePath}" already exists. Use the "edit" tool to modify existing files.`;
    }

    const parentDir = path.posix.dirname(fullPath);
    await sandbox.process.executeCommand(`mkdir -p "${parentDir}"`);

    await sandbox.fs.uploadFile(Buffer.from(String(content), "utf-8"), fullPath);
    return `Created new file "${filePath}" successfully.`;
  } catch (error) {
    return `Error creating "${filePath}": ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}
