/** Dynamic test-data generators. Nothing hardcoded per client. */

export function randomString(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function randomNumber(): number {
  return Math.floor(Math.random() * 900) + 100;
}

/** Unique, sortable, human-readable event title. */
export function generateEventTitle(prefix = "UI_Auto_Event"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  return `${prefix}_${stamp}`;
}

export function attachmentUrl(): string {
  return "https://picsum.photos/id/237/200/300";
}

/** Run an array through an async fn strictly in order (no parallelism). */
export async function forEachSequential<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    await fn(items[i], i);
  }
}
