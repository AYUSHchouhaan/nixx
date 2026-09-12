import type { Sandbox } from "@daytonaio/sdk";
import { absolutePath } from "./path-utils";

export async function readFiles(
  sandbox: Sandbox,
  repoDir: string,
  filePaths: string[],
): Promise<string> {
  const results = await Promise.all(
    filePaths.slice(0, 10).map(async (filePath) => {
      try {
        const content = await sandbox.fs.downloadFile(
          absolutePath(repoDir, String(filePath)),
        );
        return `=== ${filePath} ===\n${content.toString("utf-8")}`;
      } catch (error) {
        return `=== ${filePath} ===\nError reading file: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }),
  );
  return results.join("\n\n");
}
