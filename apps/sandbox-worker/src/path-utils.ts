import path from "node:path";

export function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

export function absolutePath(repoDir: string, filePath: string): string {
  return path.posix.join(repoDir, toPosix(String(filePath)));
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
