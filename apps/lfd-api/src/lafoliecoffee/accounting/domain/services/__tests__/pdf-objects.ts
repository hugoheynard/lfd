import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

/**
 * Lire un PDF de `pdfkit` sans bibliothèque (E3b) : ses objets, la pièce
 * jointe, et le texte dessiné en polices EMBARQUÉES.
 *
 * 🔴 `pdf-drawn-text.ts` ne suffit plus ici : il décode des chaînes WinAnsi,
 * celles des polices standard. Une police TrueType embarquée écrit des
 * NUMÉROS DE GLYPHE sur deux octets, propres à chaque police ; seul son
 * `ToUnicode` les rend lisibles, et il faut suivre quelle police est active
 * (`/F1 9 Tf`). Sans ce décodage, une assertion « le numéro est imprimé »
 * échouerait toujours — et une assertion d'absence passerait toujours.
 */

export interface PdfObject {
  readonly dictionary: string;
  /** Le flux, inflaté s'il était déflaté ; `null` sans flux. */
  readonly stream: Buffer | null;
}

/** Tous les objets `N 0 obj … endobj`, par numéro. */
export function pdfObjects(pdf: Buffer): ReadonlyMap<number, PdfObject> {
  const text = pdf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  for (const match of text.matchAll(/(\d+) 0 obj\s*([\s\S]*?)\nendobj/gu)) {
    const [, number = "0", body = ""] = match;
    const start = (match.index ?? 0) + match[0].indexOf(body);
    const streamAt = body.indexOf("stream\n");
    if (streamAt === -1) {
      objects.set(Number(number), { dictionary: body, stream: null });
      continue;
    }
    const end = body.lastIndexOf("\nendstream");
    const raw = pdf.subarray(start + streamAt + 7, start + end);
    const dictionary = body.slice(0, streamAt);
    objects.set(Number(number), {
      dictionary,
      stream: dictionary.includes("/FlateDecode") ? inflateSync(raw) : raw,
    });
  }
  return objects;
}

/** Les flux des objets dont le dictionnaire contient `marker`. */
export function streamsWith(pdf: Buffer, marker: string): readonly Buffer[] {
  return [...pdfObjects(pdf).values()]
    .filter((object) => object.dictionary.includes(marker) && object.stream !== null)
    .map((object) => object.stream ?? Buffer.alloc(0));
}

/** La table glyphe → caractère d'un `ToUnicode` de `pdfkit` (des `bfrange` à tableau). */
function cmapOf(stream: Buffer): ReadonlyMap<number, string> {
  const map = new Map<number, string>();
  for (const range of stream
    .toString("latin1")
    .matchAll(/<([0-9a-f]+)> <[0-9a-f]+> \[([^\]]*)\]/giu)) {
    const [, first = "0", entries = ""] = range;
    [...entries.matchAll(/<([0-9a-f ]+)>/giu)].forEach((entry, offset) => {
      const units = (entry[1] ?? "").split(" ").map((unit) => parseInt(unit, 16));
      map.set(parseInt(first, 16) + offset, String.fromCharCode(...units));
    });
  }
  return map;
}

/** Le nom de ressource (`F1`) → la table de sa police. */
function fontTables(
  objects: ReadonlyMap<number, PdfObject>,
): ReadonlyMap<string, ReadonlyMap<number, string>> {
  const tables = new Map<string, ReadonlyMap<number, string>>();
  for (const object of objects.values()) {
    for (const block of object.dictionary.matchAll(/\/Font <<([^>]*)>>/gu)) {
      for (const [, name = "", ref = "0"] of (block[1] ?? "").matchAll(/\/(F\d+) (\d+) 0 R/gu)) {
        const font = objects.get(Number(ref));
        const unicodeRef = /\/ToUnicode (\d+) 0 R/u.exec(font?.dictionary ?? "")?.[1];
        const cmap = unicodeRef === undefined ? undefined : objects.get(Number(unicodeRef))?.stream;
        if (cmap !== undefined && cmap !== null) {
          tables.set(name, cmapOf(cmap));
        }
      }
    }
  }
  return tables;
}

/** Le texte dessiné, en clair : un bloc `BT … ET` par ligne. */
export function drawnUnicodeText(pdf: Buffer): string {
  const objects = pdfObjects(pdf);
  const tables = fontTables(objects);
  const lines: string[] = [];
  for (const object of objects.values()) {
    const content = object.stream?.toString("latin1") ?? "";
    if (object.dictionary.includes("/Subtype") || !content.includes("BT")) {
      continue;
    }
    let table: ReadonlyMap<number, string> = new Map();
    let line = "";
    for (const token of content.matchAll(/\/(F\d+) [\d.]+ Tf|<([0-9a-f]*)>|\bET\b/giu)) {
      if (token[1] !== undefined) {
        table = tables.get(token[1]) ?? new Map();
      } else if (token[2] !== undefined) {
        for (const glyph of token[2].match(/.{4}/gu) ?? []) {
          line += table.get(parseInt(glyph, 16)) ?? "�";
        }
      } else {
        lines.push(line);
        line = "";
      }
    }
  }
  return lines.join("\n");
}
