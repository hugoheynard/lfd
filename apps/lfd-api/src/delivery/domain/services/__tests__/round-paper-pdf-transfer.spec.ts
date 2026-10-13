import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import type { RoundPaper, RoundPaperTransferStop } from "../round-paper.js";
import { renderRoundPaperPdf } from "../round-paper-pdf.js";

/**
 * **L'arrêt de transfert sur la feuille de tournée** (décision de Hugo du
 * 2026-10-13). Le jour et l'instant ne sont que recopiés : jamais comparés à
 * l'horloge.
 */
const DAY = "2026-10-07";
const PRINTED = new Date("2026-10-07T04:15:00.000Z");

function transfer(overrides: Partial<RoundPaperTransferStop> = {}): RoundPaperTransferStop {
  return {
    kind: "transfer",
    siteLabel: "Val Village",
    addressLines: ["1 place du Village", "73320 Tignes"],
    arrivalBy: "09:30",
    binCount: 2,
    orderCount: 3,
    orderTotals: [{ productName: "Croissant", quantity: 12 }],
    resupplyCount: 0,
    resupplyTotals: [],
    ...overrides,
  };
}

async function textOf(stop: RoundPaperTransferStop): Promise<string> {
  const paper: RoundPaper = {
    vehicleName: "Kangoo blanc",
    passage: 1,
    serviceDay: DAY,
    driverName: null,
    planned: null,
    stops: [stop],
    printedAt: PRINTED,
  };
  return pdfPages(await renderRoundPaperPdf(paper)).join("\n");
}

describe("la feuille de tournée — l'arrêt de transfert", () => {
  it("dit le site, l'heure, les bacs et le total des commandes, avec sa case « Remis »", async () => {
    const text = await textOf(transfer());

    expect(text).toContain("Vers Val Village · avant 9 h 30");
    expect(text).toContain("73320 Tignes");
    expect(text).toContain("2 bacs");
    expect(text).toContain("COMMANDES · 3 COMMANDES");
    expect(text).toContain("12 × Croissant");
    expect(text).toContain("Remis");
    expect(text).toContain("2 bacs à charger");
    expect(text).not.toContain("RÉAPPROVISIONNEMENT");
  });

  it("sans heure ni adresse ni bac : le dit, sans rien inventer", async () => {
    const text = await textOf(transfer({ arrivalBy: null, addressLines: [], binCount: 0 }));

    expect(text).toContain("Vers Val Village · Sans heure");
    expect(text).toContain("Adresse du site inconnue");
    expect(text).toContain("Aucun bac déclaré");
  });

  it("imprime le réapprovisionnement comme une section à part", async () => {
    const text = await textOf(
      transfer({
        resupplyCount: 1,
        resupplyTotals: [{ productName: "Baguette", quantity: 20 }],
      }),
    );

    expect(text).toContain("RÉAPPROVISIONNEMENT · 1 ÉLÉMENT");
    expect(text).toContain("20 × Baguette");
  });
});
