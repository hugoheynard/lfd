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
  // La LONGUEUR déclarée, pas la recherche de `endstream` : un flux compressé
  // dont le dernier octet est un retour chariot était amputé par `\r?\n`
  // avant `endstream`, et la page disparaissait. Ce dernier octet dépend du
  // contenu — de l'heure imprimée sur le papier : un test vert le matin, rouge
  // l'après-midi (constaté le 2026-10-07, `delivery-round-paper.e2e-spec.ts`).
  const stream = /\/Length (\d+)[^>]*>>\s*stream\r?\n/g;
  for (let match = stream.exec(raw); match !== null; match = stream.exec(raw)) {
    const start = match.index + match[0].length;
    const body = raw.slice(start, start + Number(match[1]));
    const content = inflate(body);
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
