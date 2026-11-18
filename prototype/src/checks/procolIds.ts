/**
 * Procol's numeric id ↔ the uuid its API takes (lib/encrypt_decrypt.rb) — the same scheme for every model
 * (users, hubs, templates, approval flows). For looking up our own rows by name with a SELECT and handing the
 * API the uuid it expects.
 */
const KEY = "gZckDpNXdQ";

export function encodeId(id: number): string {
  const s = String(id * 3 + 1022).split("");
  const rot = [...s.slice(3), ...s.slice(0, 3)];
  return Buffer.from(rot.map((c) => KEY[Number(c)]).join("")).toString("base64");
}

export function decodeId(uuid: string): number | undefined {
  const digits = [...Buffer.from(uuid, "base64").toString("latin1")].map((ch) => KEY.indexOf(ch));
  if (!digits.length || digits.some((d) => d < 0)) return undefined;
  const n = Number([...digits.slice(-3), ...digits.slice(0, -3)].join(""));
  const id = (n - 1022) / 3;
  return Number.isInteger(id) && id > 0 ? id : undefined;
}
