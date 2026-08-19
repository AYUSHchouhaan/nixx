import type {
  SandboxCallResult,
  SandboxProvisionResult,
} from "@repo/contracts";

type PendingCall<T> = {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const commandCalls = new Map<string, PendingCall<SandboxCallResult>>();
const provisionCalls = new Map<string, PendingCall<SandboxProvisionResult>>();

function register<T>(
  map: Map<string, PendingCall<T>>,
  commandId: string,
  call: PendingCall<T>,
) {
  map.set(commandId, call);
}

function resolve<T>(
  map: Map<string, PendingCall<T>>,
  commandId: string,
  result: T,
): boolean {
  const call = map.get(commandId);
  if (!call) return false;
  map.delete(commandId);
  clearTimeout(call.timer);
  call.resolve(result);
  return true;
}

function reject<T>(
  map: Map<string, PendingCall<T>>,
  commandId: string,
  reason: Error,
): boolean {
  const call = map.get(commandId);
  if (!call) return false;
  map.delete(commandId);
  clearTimeout(call.timer);
  call.reject(reason);
  return true;
}

export function registerPendingCall(
  commandId: string,
  call: PendingCall<SandboxCallResult>,
) {
  register(commandCalls, commandId, call);
}

export function resolvePendingCall(commandId: string, result: SandboxCallResult) {
  return resolve(commandCalls, commandId, result);
}

export function rejectPendingCall(commandId: string, reason: Error) {
  return reject(commandCalls, commandId, reason);
}

export function registerPendingProvision(
  commandId: string,
  call: PendingCall<SandboxProvisionResult>,
) {
  register(provisionCalls, commandId, call);
}

export function resolvePendingProvision(
  commandId: string,
  result: SandboxProvisionResult,
) {
  return resolve(provisionCalls, commandId, result);
}

export function rejectPendingProvision(commandId: string, reason: Error) {
  return reject(provisionCalls, commandId, reason);
}
