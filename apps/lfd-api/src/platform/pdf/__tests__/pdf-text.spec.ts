import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";

import { pdfPages } from "./pdf-text.js";

/** Un PDF réduit à un flux de page : `<< /Length N >> stream … endstream`. */
function pdfWith(compressed: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(
      `<< /Length ${String(compressed.length)} /Filter /FlateDecode >>\nstream\n`,
      "latin1",
    ),
    compressed,
    Buffer.from("\nendstream\n", "latin1"),
  ]);
}

/** Une page dont le flux compressé finit par un retour chariot (0x0d). */
function pageEndingWithCarriageReturn(): { readonly text: string; readonly compressed: Buffer } {
  for (let seed = 0; seed < 100_000; seed += 1) {
    const text = `Tournée ${String(seed)}`;
    const content = `BT [<${Buffer.from(text, "latin1").toString("hex")}>] TJ ET`;
    const compressed = deflateSync(Buffer.from(content, "latin1"));
    if (compressed[compressed.length - 1] === 0x0d) {
      return { text, compressed };
    }
  }
  throw new Error("aucun flux ne finit par 0x0d");
}

/**
 * Régression : le flux se cherchait jusqu'à `\r?\nendstream`, qui mangeait un
 * dernier octet compressé égal à `\r` — la page disparaissait, et la feuille de
 * tournée sortait vide selon l'heure imprimée dessus (2026-10-07).
 */
describe("pdfPages", () => {
  it("lit une page dont le flux compressé finit par un retour chariot", () => {
    const { text, compressed } = pageEndingWithCarriageReturn();

    expect(pdfPages(pdfWith(compressed))).toEqual([text]);
  });

  it("lit une page ordinaire", () => {
    const compressed = deflateSync(Buffer.from("BT [<4b616e676f6f>] TJ ET", "latin1"));

    expect(pdfPages(pdfWith(compressed))).toEqual(["Kangoo"]);
  });
});
