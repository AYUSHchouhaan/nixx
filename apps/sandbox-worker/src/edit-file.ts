import type { Sandbox } from "@daytonaio/sdk";
import { absolutePath } from "./path-utils";

export async function editFile(
  sandbox: Sandbox,
  repoDir: string,
  filePath: string,
  edits: Array<{ oldStr: string; newStr: string }>,
): Promise<string> {
  try {
    const fullPath = absolutePath(repoDir, filePath);

    let content: string;
    try {
      const buffer = await sandbox.fs.downloadFile(fullPath);
      content = buffer.toString("utf-8");
    } catch {
      return `Error: "${filePath}" does not exist. Use the "create_file" tool to create new files.`;
    }

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!edit) continue;
      let { oldStr, newStr } = edit;

      if (!content.includes(oldStr)) {
        const normalizedContent = content.replace(/\r\n/g, "\n");
        const normalizedOldStr = oldStr.replace(/\r\n/g, "\n");

        if (normalizedContent.includes(normalizedOldStr)) {
          content = normalizedContent;
          oldStr = normalizedOldStr;
          newStr = newStr.replace(/\r\n/g, "\n");
        } else {
          return `Error: edits[${i}] oldStr not found in "${filePath}".`;
        }
      }

      content = content.replace(oldStr, newStr);
    }

    await sandbox.fs.uploadFile(Buffer.from(content, "utf-8"), fullPath);
    return `Successfully applied ${edits.length} edit(s) to "${filePath}".`;
  } catch (error) {
    return `Error editing "${filePath}": ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}
