import type { ProgrammerGraphDeps } from "../types";
import { createReadTool } from "./read";
import { createGlobTool } from "./glob";
import { createGrepTool } from "./grep";
import { createRunTool } from "./bash";
import { createFileTool } from "./create-file";
import { createEditTool } from "./edit";
import { createMarkTaskCompleteTool } from "./mark-task-complete";

export function createSandboxTools(deps: ProgrammerGraphDeps) {
  return {
    read: createReadTool(deps),
    glob: createGlobTool(deps),
    grep: createGrepTool(deps),
    run: createRunTool(deps),
    createFile: createFileTool(deps),
    edit: createEditTool(deps),
    markTaskComplete: createMarkTaskCompleteTool(),
  };
}

export type SandboxTools = ReturnType<typeof createSandboxTools>;
