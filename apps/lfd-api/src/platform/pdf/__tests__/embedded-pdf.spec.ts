import { Buffer } from "node:buffer";

import { overlaidPdf, readablePdfOf } from "../embedded-pdf.js";
import { depositedPdf, pageCountOf } from "./function-sheet-pdf.fixture.js";

const BAND = { top: 20, bottom: 780 };

describe("readablePdfOf", () => {
  it("lit un PDF et compte ses pages", async () => {
    const readable = await readablePdfOf(await depositedPdf("Déroulé", 3));
    expect(readable?.pageCount).toBe(3);
  });

  it("rend null pour des octets qui ne sont pas un PDF, ou un PDF tronqué", async () => {
    expect(await readablePdfOf(Buffer.from("PK\u0003\u0004 un classeur Excel"))).toBeNull();
    const pdf = await depositedPdf("Déroulé", 1);
    expect(await readablePdfOf(pdf.subarray(0, 40))).toBeNull();
  });
});

describe("overlaidPdf", () => {
  it("rend le papier tel quel quand il n'y a rien à poser", async () => {
    const paper = await depositedPdf("Papier", 1);
    expect(await overlaidPdf(paper, [], BAND)).toBe(paper);
  });

  it("pose chaque page sur sa page réservée, sans en ajouter, et rend les mêmes octets deux fois", async () => {
    const paper = await depositedPdf("Papier", 3);
    const sheet = await readablePdfOf(await depositedPdf("Fiche", 2));
    if (sheet === null) {
      throw new TypeError("la fiche de test doit se lire");
    }
    const overlays = [
      { pageIndex: 1, source: sheet.source, sourcePage: 0 },
      { pageIndex: 2, source: sheet.source, sourcePage: 1 },
    ];

    const first = await overlaidPdf(paper, overlays, BAND);
    const second = await overlaidPdf(paper, overlays, BAND);

    expect(await pageCountOf(first)).toBe(3);
    expect(first.length).toBeGreaterThan(paper.length);
    expect(first.equals(second)).toBe(true);
  });
});
