import { unzipSync } from "fflate";

import { FflateStoredZipWriter } from "../fflate-stored-zip-writer.js";

/** Méthode de compression d'une entrée locale : 2 octets LE à l'offset 8 de l'en-tête `PK\x03\x04`. */
function methodsOf(zip: Uint8Array): number[] {
  const methods: number[] = [];
  for (let offset = 0; offset + 30 <= zip.length; offset += 1) {
    if (
      zip[offset] === 0x50 &&
      zip[offset + 1] === 0x4b &&
      zip[offset + 2] === 3 &&
      zip[offset + 3] === 4
    ) {
      methods.push((zip[offset + 8] ?? 0) | ((zip[offset + 9] ?? 0) << 8));
    }
  }
  return methods;
}

describe("le zip rangé sans compression", () => {
  const entries = [
    {
      name: "FA-LFD-2026-000002.pdf",
      bytes: new TextEncoder().encode("%PDF b".repeat(50)),
      modifiedOn: "2026-03-02",
    },
    {
      name: "FA-LFD-2026-000001.pdf",
      bytes: new TextEncoder().encode("%PDF a"),
      modifiedOn: "2026-03-01",
    },
  ];

  it("chaque entrée est en STORE (méthode 0), relue octet pour octet", () => {
    const zip = new FflateStoredZipWriter().write(entries);

    expect(methodsOf(zip)).toEqual([0, 0]);
    const read = unzipSync(zip);
    expect(Object.keys(read)).toEqual(["FA-LFD-2026-000002.pdf", "FA-LFD-2026-000001.pdf"]);
    expect(
      Buffer.from(read["FA-LFD-2026-000002.pdf"] ?? []).equals(
        Buffer.from(entries[0]?.bytes ?? []),
      ),
    ).toBe(true);
  });

  it("le même contenu donne le même zip, d'un téléchargement à l'autre", () => {
    const writer = new FflateStoredZipWriter();

    expect(Buffer.from(writer.write(entries)).equals(Buffer.from(writer.write(entries)))).toBe(
      true,
    );
  });
});
