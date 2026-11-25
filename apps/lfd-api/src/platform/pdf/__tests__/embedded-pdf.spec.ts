import { Buffer } from "node:buffer";

import { degrees, PDFDocument } from "pdf-lib";

import { overlaidPdf, readablePdfOf, turnToPortrait } from "../embedded-pdf.js";
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

describe("turnToPortrait — une fiche en paysage est tournée, pas réduite", () => {
  const A4: readonly [number, number] = [595, 842];
  const LANDSCAPE: readonly [number, number] = [842, 595];

  async function pageOf(size: readonly [number, number], rotate = 0) {
    const doc = await PDFDocument.create();
    const page = doc.addPage([size[0], size[1]]);
    page.setRotation(degrees(rotate));
    return page;
  }

  it("laisse une page portrait droite", async () => {
    expect(turnToPortrait(await pageOf(A4), ...A4)).toBe(0);
  });

  it("tourne d'un quart de tour une page paysage", async () => {
    expect(turnToPortrait(await pageOf(LANDSCAPE), ...LANDSCAPE)).toBe(90);
  });

  it("lit le /Rotate : une feuille portrait affichée en paysage est redressée puis tournée", async () => {
    // Affichée à 90° horaire, elle se lit en paysage ; la redresser (-90)
    // puis la mettre en portrait (+90) la laisse telle quelle.
    expect(turnToPortrait(await pageOf(A4, 90), ...A4)).toBe(0);
  });

  it("lit le /Rotate : une feuille paysage affichée en portrait est seulement redressée", async () => {
    expect(turnToPortrait(await pageOf(LANDSCAPE, 90), ...LANDSCAPE)).toBe(270);
  });

  it("une page paysage posée tient sans rien ajouter au papier", async () => {
    const paper = await depositedPdf("Papier", 1);
    const doc = await PDFDocument.create();
    doc.addPage([LANDSCAPE[0], LANDSCAPE[1]]).drawText("Déroulé", { x: 40, y: 500 });
    const sheet = await readablePdfOf(await doc.save());
    if (sheet === null) {
      throw new TypeError("la fiche de test doit se lire");
    }
    const out = await overlaidPdf(
      paper,
      [{ pageIndex: 0, source: sheet.source, sourcePage: 0 }],
      BAND,
    );
    expect(await pageCountOf(out)).toBe(1);
  });
});
