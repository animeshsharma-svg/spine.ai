import { ToastRecord } from "./evidence.js";

/**
 * A process-wide sink for messages the app showed us.
 *
 * The page objects are the ones that actually see a toast — `errorToastText`
 * waits for it and reads it, three seconds before it fades. Trying to
 * re-observe the same toast from the evidence collector was a race we kept
 * losing (an antd message lives ~3s, and the harvest happens at the end of the
 * flow), so the reader reports it instead. One shared array, drained per test.
 */
const toasts: ToastRecord[] = [];

export function noteToast(severity: ToastRecord["severity"], text: string): void {
  const clean = text.trim();
  if (!clean) return;
  if (toasts.some((t) => t.text === clean && t.severity === severity)) return;
  toasts.push({ severity, text: clean, at: new Date().toISOString() });
}

export function drainToasts(): ToastRecord[] {
  return toasts.splice(0, toasts.length);
}
