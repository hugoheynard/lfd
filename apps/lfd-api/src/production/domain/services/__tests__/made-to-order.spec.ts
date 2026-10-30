import type { ProductionOrderSnapshot } from "../../entities/production-day.js";
import { renderAtelierSheetPdf, renderProductionCountPdf } from "../atelier-sheet-pdf.js";
import { dayDossierOf } from "../day-dossier.js";
import { renderDayDossierPdf } from "../day-dossier-pdf.js";
import { countPaperRowsOf } from "../made-to-order.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { PAPER_LOGO } from "./paper-logo.fixture.js";

/**
 * **« SUR MESURE » sur les papiers du fournil** (plan
 * `documentation/catalogue/plan-sur-mesure-partout.md`, M3). Le marqueur vient
 * de la ligne figée, jamais du catalogue ; `null` n'imprime rien. Instants
 * recopiés, jamais comparés à l'horloge.
 */
const CLOSED = new Date("2026-10-30T16:00:00.000Z");
const SHEET = { serviceDay: "2026-10-31", closedAt: CLOSED, logo: PAPER_LOGO };

function order(lines: ProductionOrderSnapshot["lines"]): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId: "ord-1",
    rank: 1,
    reference: "ORD-0001",
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Village",
    dueAt: "07:30",
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines,
  };
}

const MARKED = order([
  { sku: "GAT-001", productName: "Entremets", quantity: 2, saleUnit: "piece", madeToOrder: true },
  { sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece", madeToOrder: false },
]);
const UNKNOWN = order([
  { sku: "GAT-001", productName: "Entremets", quantity: 2, saleUnit: "piece", madeToOrder: null },
]);

describe("countPaperRowsOf — la part sur mesure à part (Q2)", () => {
  const count = (sku: string, quantity: number) => ({
    sku,
    productName: sku,
    quantity,
    saleUnit: "piece" as const,
    done: null,
  });

  it("un article tout sur mesure : une seule ligne, marquée", () => {
    expect(countPaperRowsOf([count("GAT-001", 2)], [MARKED])).toEqual([
      { sku: "GAT-001", productName: "GAT-001", quantity: 2, saleUnit: "piece", madeToOrder: true },
    ]);
  });

  it("une même référence mêlée : jamais fusionnée, la part sur mesure a sa ligne", () => {
    const plain = order([
      {
        sku: "GAT-001",
        productName: "Entremets",
        quantity: 5,
        saleUnit: "piece",
        madeToOrder: false,
      },
    ]);
    expect(countPaperRowsOf([count("GAT-001", 7)], [MARKED, plain])).toEqual([
      {
        sku: "GAT-001",
        productName: "GAT-001",
        quantity: 5,
        saleUnit: "piece",
        madeToOrder: false,
      },
      { sku: "GAT-001", productName: "GAT-001", quantity: 2, saleUnit: "piece", madeToOrder: true },
    ]);
  });

  it("`null` ne marque rien : le compte reste tel quel", () => {
    expect(countPaperRowsOf([count("GAT-001", 2)], [UNKNOWN])).toEqual([
      {
        sku: "GAT-001",
        productName: "GAT-001",
        quantity: 2,
        saleUnit: "piece",
        madeToOrder: false,
      },
    ]);
  });

  it("une part sur mesure plus grande que le compte est bornée : le papier ne fabrique pas", () => {
    expect(countPaperRowsOf([count("GAT-001", 1)], [MARKED])).toEqual([
      { sku: "GAT-001", productName: "GAT-001", quantity: 1, saleUnit: "piece", madeToOrder: true },
    ]);
  });
});

describe("les papiers disent « SUR MESURE »", () => {
  it("la fiche d'atelier, sous la ligne marquée", async () => {
    const [page] = pdfPages(await renderAtelierSheetPdf(MARKED, SHEET, "", null));
    expect(page).toContain("SUR MESURE");
  });

  it("la fiche d'atelier n'en dit rien sur une ligne d'avant le marqueur", async () => {
    const [page] = pdfPages(await renderAtelierSheetPdf(UNKNOWN, SHEET, "", null));
    expect(page).not.toContain("SUR MESURE");
  });

  it("le compte à produire, sur la ligne sur mesure", async () => {
    const rows = countPaperRowsOf(
      [{ sku: "GAT-001", productName: "Entremets", quantity: 2, saleUnit: "piece", done: null }],
      [MARKED],
    );
    const [page] = pdfPages(await renderProductionCountPdf(rows, SHEET, []));
    expect(page).toContain("SUR MESURE");
    expect(page).toContain("1 articles, 2 pièces");
  });

  it("le bon du dossier du jour, comme la fiche d'atelier", async () => {
    const pages = pdfPages(
      await renderDayDossierPdf(
        dayDossierOf([MARKED], new Map()),
        {
          serviceDay: SHEET.serviceDay,
          closedAt: CLOSED,
          closedBy: null,
          retakenAt: null,
          retakenByName: null,
        },
        {
          logo: PAPER_LOGO,
          colisageUrlOf: () => "",
          colors: new Map(),
          resupplyColors: new Map(),
          deliveryNotes: new Map(),
        },
      ),
    );
    expect(pages.join(" ")).toContain("SUR MESURE");
  });
});
