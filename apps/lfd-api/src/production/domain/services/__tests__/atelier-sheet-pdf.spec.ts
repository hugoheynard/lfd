import type { ProductionOrderSnapshot } from "../../entities/production-day.js";
import { renderAtelierSheetPdf, renderProductionCountPdf } from "../atelier-sheet-pdf.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";

/** Le compte à produire : la date de son pied. Instant recopié, jamais comparé à l'horloge. */
describe("renderProductionCountPdf", () => {
  /**
   * Régression : « Arrêté le … » formatait `closedAt` en UTC — une clôture après
   * 22 h heure de Paris (été) imprimait la veille (2026-10-06).
   */
  it("une clôture à 0 h 30 heure de Paris est datée de ce jour-là, pas de la veille", async () => {
    const closedAt = new Date("2026-10-06T22:30:00.000Z");
    const pages = pdfPages(
      await renderProductionCountPdf(
        [{ sku: "VIE-001", productName: "Croissant", quantity: 4, done: null }],
        "2026-10-07",
        closedAt,
        [],
      ),
    );
    expect(pages[0]).toContain("Arrêté le mercredi 7 octobre 2026");
  });
});

/** La fiche d'une commande et sa pastille (§0 bis du plan de la planche v2, 2026-10-22). */
describe("renderAtelierSheetPdf — la pastille de la commande", () => {
  const CLOSED = new Date("2026-10-06T16:00:00.000Z");
  const ORDER: ProductionOrderSnapshot = {
    packed: null,
    orderId: "ord-1",
    reference: "LFC-0001",
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Village",
    dueAt: "07:30",
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6 }],
  };

  it("pose la pastille quand la commande a une couleur, sans changer un mot", async () => {
    const plain = await renderAtelierSheetPdf(ORDER, "2026-10-07", CLOSED, "", null);
    const colored = await renderAtelierSheetPdf(ORDER, "2026-10-07", CLOSED, "", "#2e86ab");
    expect(colored.equals(plain)).toBe(false);
    expect(pdfPages(colored)).toEqual(pdfPages(plain));
    expect(pdfPages(colored).join("")).not.toMatch(/\bPro\b|Particulier/);
  });

  it("sans couleur, aucune pastille : deux tirages identiques", async () => {
    const first = await renderAtelierSheetPdf(ORDER, "2026-10-07", CLOSED, "", null);
    const second = await renderAtelierSheetPdf(ORDER, "2026-10-07", CLOSED, "", null);
    expect(first.equals(second)).toBe(true);
  });
});

/** Le camembert du jour (Hugo, 2026-10-22) : une forme, aucun mot. */
describe("renderProductionCountPdf — la répartition du jour par couleur", () => {
  const CLOSED = new Date("2026-10-06T16:00:00.000Z");
  const ITEMS = [
    { sku: "VIE-001", productName: "Croissant", quantity: 10, done: null },
    { sku: "VIE-002", productName: "Pain au chocolat", quantity: 4, done: null },
  ];

  it("dessine un camembert en haut sans changer un mot", async () => {
    const plain = await renderProductionCountPdf(ITEMS, "2026-10-07", CLOSED, []);
    const pie = await renderProductionCountPdf(ITEMS, "2026-10-07", CLOSED, [
      { color: "#2e86ab", quantity: 6 },
      { color: "#e4572e", quantity: 4 },
      { color: null, quantity: 4 },
    ]);
    expect(pie.equals(plain)).toBe(false);
    expect(pdfPages(pie)).toEqual(pdfPages(plain));
    expect(pdfPages(pie).join("")).not.toMatch(/\bPro\b|Particulier/);
  });

  it("une seule couleur fait un disque plein, et deux tirages sont identiques", async () => {
    const shares = [{ color: "#2e86ab", quantity: 14 }];
    const first = await renderProductionCountPdf(ITEMS, "2026-10-07", CLOSED, shares);
    const second = await renderProductionCountPdf(ITEMS, "2026-10-07", CLOSED, shares);
    expect(first.equals(second)).toBe(true);
  });
});
