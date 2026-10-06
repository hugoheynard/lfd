import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

/**
 * **Le texte d'un PDF de `pdfkit`, page par page** — de quoi éprouver ce qu'un
 * papier DIT sans dépendre d'un lecteur PDF.
 *
 * `pdfkit` compresse chaque flux de page (Flate) et écrit le texte en chaînes
 * hexadécimales WinAnsi, coupées par le crénage : `[<4c6f74> 30 <20647520>] TJ`.
 * On décompresse chaque flux, on recolle les morceaux d'un même `TJ`, et on rend
 * une chaîne par flux de contenu, dans l'ordre du fichier.
 */
export function pdfPages(pdf: Buffer): readonly string[] {
  const raw = pdf.toString("latin1");
  const pages: string[] = [];
  const stream = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (let match = stream.exec(raw); match !== null; match = stream.exec(raw)) {
    const content = inflate(match[1] ?? "");
    if (content !== null && content.includes("TJ")) {
      pages.push(textOf(content));
    }
  }
  return pages;
}

function inflate(body: string): string | null {
  try {
    return inflateSync(Buffer.from(body, "latin1")).toString("latin1");
  } catch {
    return null;
  }
}

function textOf(content: string): string {
  const parts: string[] = [];
  const array = /\[([^\]]*)\]\s*TJ/g;
  for (let match = array.exec(content); match !== null; match = array.exec(content)) {
    const hex = [...(match[1] ?? "").matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1] ?? "").join("");
    parts.push(Buffer.from(hex, "hex").toString("latin1"));
  }
  return parts.join("\n");
}
