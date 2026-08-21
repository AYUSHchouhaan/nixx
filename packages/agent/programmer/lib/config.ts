import type { RunnableConfig } from "@langchain/core/runnables";

export function getConfigurableString(config: RunnableConfig, name: string): string {
  const value = config.configurable?.[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing configurable.${name}`);
  }
  return value;
}
