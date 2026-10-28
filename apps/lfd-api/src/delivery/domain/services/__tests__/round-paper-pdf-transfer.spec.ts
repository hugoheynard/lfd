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
    orderColors: [],
    orderTotals: [{ productName: "Croissant", quantity: 12, saleUnit: "piece" }],
    resupplyCount: 0,
    resupplyTotals: [],
    resupplyNames: [],
    ...overrides,
  };
}

function paperOf(stop: RoundPaperTransferStop): RoundPaper {
  return {
    vehicleName: "Kangoo blanc",
    passage: 1,
    serviceDay: DAY,
    driverName: null,
    planned: null,
    stops: [stop],
    printedAt: PRINTED,
  };
}

async function textOf(stop: RoundPaperTransferStop): Promise<string> {
  return pdfPages(await renderRoundPaperPdf(paperOf(stop))).join("\n");
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
    expect(text.split("Déposé à").length - 1).toBe(1);
    expect(text).toContain("2 bacs à charger");
    expect(text).not.toContain("RÉASSORT");
  });

  it("une commande mêlée : les pièces en « × », le poids en kilos, jamais en pièces (P6)", async () => {
    const text = await textOf(
      transfer({
        orderTotals: [
          { productName: "Croissant", quantity: 12, saleUnit: "piece" },
          { productName: "Saumon gravlax", quantity: 1250, saleUnit: "weight" },
          { productName: "Graines au chocolat", quantity: 500, saleUnit: "weight" },
        ],
      }),
    );

    expect(text).toContain("12 × Croissant");
    expect(text).toContain("1,25 kg · Saumon gravlax");
    expect(text).toContain("500 g · Graines au chocolat");
    expect(text).not.toContain("1250");
  });

  it("sans heure ni adresse ni bac : le dit, sans rien inventer", async () => {
    const text = await textOf(transfer({ arrivalBy: null, addressLines: [], binCount: 0 }));

    expect(text).toContain("Vers Val Village · Sans heure");
    expect(text).toContain("Adresse du site inconnue");
    expect(text).toContain("Aucun bac déclaré");
  });

  it("imprime le réassort comme une section à part — « Réassort », plus « Réapprovisionnement » (R1g)", async () => {
    const text = await textOf(
      transfer({
        resupplyCount: 1,
        resupplyTotals: [{ productName: "Baguette", quantity: 20, saleUnit: "piece" }],
      }),
    );

    expect(text).toContain("RÉASSORTS · 1 RÉASSORT");
    expect(text).not.toContain("RÉAPPROVISIONNEMENT");
    expect(text).toContain("20 × Baguette");
  });

  it("nomme les réassorts nommés sous le titre de la section (R1g)", async () => {
    const text = await textOf(
      transfer({
        resupplyCount: 2,
        resupplyTotals: [{ productName: "Baguette", quantity: 20, saleUnit: "piece" }],
        resupplyNames: ["Vitrine du matin", "Goûter"],
      }),
    );

    expect(text).toContain("RÉASSORTS · 2 RÉASSORTS");
    expect(text).toContain("Vitrine du matin · Goûter");
  });
});

describe("la feuille de tournée — une pastille par commande du transfert (§0 bis, 2026-10-22)", () => {
  it("pose les pastilles sous le titre des commandes, sans changer un mot", async () => {
    const plain = await renderRoundPaperPdf(paperOf(transfer()));
    const colored = await renderRoundPaperPdf(
      paperOf(transfer({ orderColors: ["#43a047", "#e4572e"] })),
    );
    expect(colored.equals(plain)).toBe(false);
    expect(pdfPages(colored)).toEqual(pdfPages(plain));
    expect(pdfPages(colored).join("")).not.toMatch(/\bPro\b|Particulier/);
  });

  it("tient sur la ligne suivante quand les commandes sont nombreuses", async () => {
    const many = Array.from({ length: 80 }, () => "#43a047");
    const pages = pdfPages(
      await renderRoundPaperPdf(paperOf(transfer({ orderCount: 80, orderColors: many }))),
    );
    expect(pages.join("\n")).toContain("12 × Croissant");
  });
});
