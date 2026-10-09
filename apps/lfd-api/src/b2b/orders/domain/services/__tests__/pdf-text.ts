import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

/**
 * Le texte d'un PDF, flux décompressés **et chaînes décodées**.
 *
 * Deux obstacles, et les deux rendaient un test muet :
 *
 * 1. `pdfkit` comprime ses flux de contenu (`FlateDecode`). Sans l'inflation,
 *    une assertion sur le texte ne trouve jamais rien — et un test qui ne peut
 *    pas échouer est pire qu'un test absent.
 * 2. Il écrit le texte en **hexadécimal**, découpé par le crénage :
 *    `[<4c6120> 30 <466f6c6965> 0] TJ`. Lire le flux brut ne montre donc que des
 *    octets. On recolle les morceaux et on les décode en latin1 — l'encodage
 *    WinAnsi que les polices standard déclarent.
 */
export function pdfText(pdf: Buffer): string {
  const streams: string[] = [];
  const raw = pdf.toString("latin1");
  const pattern = /stream\r?\n/gu;
  let match = pattern.exec(raw);
  while (match !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end > start) {
      try {
        streams.push(inflateSync(pdf.subarray(start, end)).toString("latin1"));
      } catch {
        // Un flux qui n'est pas du contenu compressé (une police, un objet
        // binaire) : on l'ignore plutôt que de faire échouer la lecture.
      }
    }
    match = pattern.exec(raw);
  }
  const content = streams.join("\n");
  const decoded: string[] = [];
  for (const hex of content.matchAll(/<([0-9a-fA-F]+)>/gu)) {
    decoded.push(Buffer.from(hex[1] ?? "", "hex").toString("latin1"));
  }
  // Les chaînes littérales, pour les flux que `pdfkit` n'écrit pas en hexa.
  for (const literal of content.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/gu)) {
    decoded.push(literal[1] ?? "");
  }
  return decoded.join("");
}
