/**
 * Procol's public ids ("Y2RaY3Bj") are an obfuscation of the database id, not
 * a random token: `EncryptDecrypt.encode_data` in procol-backend
 * (lib/encrypt_decrypt.rb) multiplies by 3, adds 1022, rotates the digits by
 * three, maps each digit through "gZckDpNXdQ" and base64-encodes the result.
 * Mirrored here so a run can open an event by the id the database knows it by
 * (83753 → Y2RaY3Bj, verified against a live payload).
 */
const DIGITS = "gZckDpNXdQ";

export function encodeProcolId(id: number): string {
  const n = Math.trunc(id) * 3 + 1022;
  const d = String(n).split("");
  const rotated = [...d.slice(3), ...d.slice(0, 3)];
  const mapped = rotated.map((x) => DIGITS[Number(x)]).join("");
  return Buffer.from(mapped, "utf8").toString("base64");
}

export function decodeProcolId(uuid: string): number | null {
  try {
    const mapped = Buffer.from(uuid, "base64").toString("utf8");
    const digits = mapped.split("").map((c) => DIGITS.indexOf(c));
    if (digits.some((x) => x < 0)) return null;
    const k = digits.length;
    // Undo rotate(3): rotate right by 3.
    const r = 3 % k;
    const orig = [...digits.slice(k - r), ...digits.slice(0, k - r)];
    const n = Number(orig.join(""));
    const id = (n - 1022) / 3;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
