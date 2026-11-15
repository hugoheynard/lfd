import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

const STREAM = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
const LENGTH = /\/Length \d+/g;

/**
 * L'empreinte d'un PDF, indépendante de la machine qui l'a rendu.
 *
 * Les octets compressés d'un flux dépendent du zlib de la machine : le même
 * papier rendu sur macOS et sur l'image Linux de la CI a deux SHA-256
 * différents. On hache donc le document avec chaque flux décompressé, et sans
 * les `/Length` qui suivent la taille compressée : deux rendus identiques ont
 * la même empreinte partout, un changement de mise en page la change.
 */
export function pdfFingerprint(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString("latin1");
  const normalized = text
    .replace(STREAM, (_match, body: string) => {
      const raw = Buffer.from(body, "latin1");
      return `stream\n${inflatedOrRaw(raw).toString("latin1")}\nendstream`;
    })
    .replace(LENGTH, "/Length")
    .replace(/startxref\s+\d+/, "startxref")
    .replace(/xref[\s\S]*?trailer/, "xref trailer");
  return createHash("sha256").update(normalized, "latin1").digest("hex");
}

/** Un flux qui n'est pas compressé (une image brute) se garde tel quel. */
function inflatedOrRaw(raw: Buffer): Buffer {
  try {
    return inflateSync(raw);
  } catch {
    return raw;
  }
}
