/** Les deux pièces imagées d'une remise à la porte. */
export type HandoverProofPiece = "photo" | "signature";

export type HandoverProofImageContentType =
  "image/jpeg" | "image/png" | "image/webp" | "image/heic";

/** Les marques HEIF d'un iPhone et de ses cousins, lues à l'octet 8. */
const HEIC_BRANDS: ReadonlySet<string> = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
]);

const JPEG_MAGIC: readonly number[] = [0xff, 0xd8, 0xff];
const PNG_MAGIC: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Le type d'une pièce rangée, relu dans ses octets — aucune colonne ne le
 * porte. `null` : aucun des quatre formats que la livraison accepte.
 *
 * Les mêmes formats que `incidentPhotoContentType` de la livraison, qui les a
 * validés à l'entrée (`delivery/domain/value-objects/doorstep-receipt.ts`,
 * vérifié le 2026-10-02) ; recopiés parce que `handover → delivery` ne passe
 * que par le canal, et qu'un relecteur d'octets n'est pas une surface publiée.
 */
export function handoverProofImageContentType(bytes: Buffer): HandoverProofImageContentType | null {
  if (startsWith(bytes, JPEG_MAGIC)) {
    return "image/jpeg";
  }
  if (startsWith(bytes, PNG_MAGIC)) {
    return "image/png";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (ascii(bytes, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(bytes, 8, 12))) {
    return "image/heic";
  }
  return null;
}

function startsWith(bytes: Buffer, magic: readonly number[]): boolean {
  return bytes.length >= magic.length && magic.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Buffer, from: number, to: number): string {
  return bytes.length < to ? "" : bytes.subarray(from, to).toString("latin1");
}
