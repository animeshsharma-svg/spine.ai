/** Dynamic test-data generators. Nothing hardcoded per client. */

export function randomString(length = 8): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function randomNumber(): number {
  return Math.floor(Math.random() * 900) + 100;
}

/**
 * Every event the UI automation creates is "spine-ui-automation-<n>", on every
 * client, so it can be told apart from API-made ones ("spine-API-automation-<n>").
 * The prefix callers pass (which flow made it) is no longer part of the title.
 */
export function generateEventTitle(_prefix = "UI_Auto_Event"): string {
  return `spine-ui-automation-${Math.floor(10_000_000 + Math.random() * 90_000_000)}`;
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
