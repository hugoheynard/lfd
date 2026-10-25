import type { ProductionOrderSnapshot } from "../../entities/production-day.js";
import { renderAtelierSheetPdf, renderProductionCountPdf } from "../atelier-sheet-pdf.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { PAPER_LOGO } from "./paper-logo.fixture.js";

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
        { serviceDay: "2026-10-07", closedAt, logo: PAPER_LOGO },
        [],
      ),
    );
    expect(pages[0]).toContain("Arrêté le mercredi 7 octobre 2026");
  });
});

/** La fiche d'une commande et sa pastille (§0 bis du plan de la planche v2, 2026-10-22). */
describe("renderAtelierSheetPdf — la pastille de la commande", () => {
  const CLOSED = new Date("2026-10-06T16:00:00.000Z");
  const SHEET = { serviceDay: "2026-10-07", closedAt: CLOSED, logo: PAPER_LOGO };
  const ORDER: ProductionOrderSnapshot = {
    packed: null,
    orderId: "ord-1",
    reference: "ORD-0001",
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
    const plain = await renderAtelierSheetPdf(ORDER, SHEET, "", null);
    const colored = await renderAtelierSheetPdf(ORDER, SHEET, "", "#2e86ab");
    expect(colored.equals(plain)).toBe(false);
    expect(pdfPages(colored)).toEqual(pdfPages(plain));
  });

  it("sans couleur, aucune pastille : deux tirages identiques", async () => {
    const first = await renderAtelierSheetPdf(ORDER, SHEET, "", null);
    const second = await renderAtelierSheetPdf(ORDER, SHEET, "", null);
    expect(first.equals(second)).toBe(true);
  });
});

/** La mise en page du 2026-10-25 (Hugo) : titre, acheminement, cadre. */
describe("renderAtelierSheetPdf — en-tête et acheminement", () => {
  const SHEET = {
    serviceDay: "2026-10-07",
    closedAt: new Date("2026-10-06T16:00:00.000Z"),
    logo: PAPER_LOGO,
  };
  const ORDER: ProductionOrderSnapshot = {
    packed: null,
    orderId: "ord-1",
    reference: "ORD-0001",
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Village",
    dueAt: "07:30",
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6 }],
  };

  it("se titre « ORD-0001 // Fiche de préparation » et dit « Retrait Village · pro »", async () => {
    const [page] = pdfPages(await renderAtelierSheetPdf(ORDER, SHEET, "", null));
    expect(page).toContain("ORD-0001 // Fiche de préparation");
    expect(page).toContain("Retrait Village · pro");
    expect(page).toContain("1/1");
    expect(page).not.toContain("La Folie Coffee");
  });

  it("une livraison de particulier se dit « Livraison · particulier »", async () => {
    const [page] = pdfPages(
      await renderAtelierSheetPdf(
        { ...ORDER, fulfillmentMethod: "delivery", clientele: "public" },
        SHEET,
        "",
        null,
      ),
    );
    expect(page).toContain("Livraison · particulier");
  });

  it("une fiche qui déborde porte « (1/2) », « (2/2) » dans son titre", async () => {
    const lines = Array.from({ length: 40 }, (_, index) => ({
      sku: `SKU-${String(index).padStart(3, "0")}`,
      productName: `Produit ${String(index)}`,
      quantity: 1,
    }));
    const pages = pdfPages(await renderAtelierSheetPdf({ ...ORDER, lines }, SHEET, "", null));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("ORD-0001 // Fiche de préparation (1/2)");
    expect(pages[1]).toContain("ORD-0001 // Fiche de préparation (2/2)");
    expect(pages[1]).toContain("2/2");
  });
});

/** Le camembert du jour (Hugo, 2026-10-22) : une forme, aucun mot. */
describe("renderProductionCountPdf — la répartition du jour par couleur", () => {
  const CLOSED = new Date("2026-10-06T16:00:00.000Z");
  const COUNT_SHEET = { serviceDay: "2026-10-07", closedAt: CLOSED, logo: PAPER_LOGO };
  const ITEMS = [
    { sku: "VIE-001", productName: "Croissant", quantity: 10, done: null },
    { sku: "VIE-002", productName: "Pain au chocolat", quantity: 4, done: null },
  ];

  it("dessine un camembert en haut sans changer un mot", async () => {
    const plain = await renderProductionCountPdf(ITEMS, COUNT_SHEET, []);
    const pie = await renderProductionCountPdf(ITEMS, COUNT_SHEET, [
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
    const first = await renderProductionCountPdf(ITEMS, COUNT_SHEET, shares);
    const second = await renderProductionCountPdf(ITEMS, COUNT_SHEET, shares);
    expect(first.equals(second)).toBe(true);
  });
});

/** Le compte à produire dans le cadre des papiers du fournil (Hugo, 2026-10-25). */
describe("renderProductionCountPdf — le cadre", () => {
  const SHEET = {
    serviceDay: "2026-10-07",
    closedAt: new Date("2026-10-06T16:00:00.000Z"),
    logo: PAPER_LOGO,
  };

  it("se titre « Compte à produire » et ne nomme plus « La Folie Coffee — Fournil »", async () => {
    const [page] = pdfPages(
      await renderProductionCountPdf(
        [{ sku: "VIE-001", productName: "Croissant", quantity: 4, done: null }],
        SHEET,
        [],
      ),
    );
    expect(page).toContain("Compte à produire");
    expect(page).toContain("1/1");
    expect(page).not.toContain("La Folie Coffee");
  });

  it("un compte qui déborde porte « (1/2) », « (2/2) » dans son titre", async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      sku: `SKU-${String(index).padStart(3, "0")}`,
      productName: `Produit ${String(index)}`,
      quantity: 1,
      done: null,
    }));
    const pages = pdfPages(await renderProductionCountPdf(items, SHEET, []));
    expect(pages).toHaveLength(2);
    expect(pages[0]).toContain("Compte à produire (1/2)");
    expect(pages[1]).toContain("Compte à produire (2/2)");
  });
});
