import type { SandboxCallResult } from "@repo/contracts";

type PendingCall = {
  resolve: (value: SandboxCallResult) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingCall>();

export function registerPendingCall(
  commandId: string,
  call: PendingCall,
) {
  pending.set(commandId, call);
}

export function resolvePendingCall(commandId: string, result: SandboxCallResult) {
  const call = pending.get(commandId);
  if (!call) return false;
  pending.delete(commandId);
  clearTimeout(call.timer);
  call.resolve(result);
  return true;
}

export function rejectPendingCall(commandId: string, reason: Error) {
  const call = pending.get(commandId);
  if (!call) return false;
  pending.delete(commandId);
  clearTimeout(call.timer);
  call.reject(reason);
  return true;
}
