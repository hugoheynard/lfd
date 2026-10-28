import type { CatalogFamilyView } from "@lfd/contracts";

import type {
  ProductionLineSnapshot,
  ProductionOrderSnapshot,
} from "../../entities/production-day.js";
import { renderAtelierSheetPdf, renderProductionCountPdf } from "../atelier-sheet-pdf.js";
import { countColorSharesOf } from "../count-color-shares.js";
import { dayDossierOf, recapPieces } from "../day-dossier.js";
import { dossierCountsOf } from "../dossier-addressees.js";
import { pdfPages } from "../../../../platform/pdf/__tests__/pdf-text.js";
import { PAPER_LOGO } from "./paper-logo.fixture.js";

/**
 * **Les papiers et les comptes du fournil, au poids** (plan
 * `documentation/pricing/vente-au-poids.md`, P6) : une ligne au poids
 * se compte en grammes, se dit en kilos, et pèse UNE pièce dans les totaux
 * qui additionnent des articles différents.
 *
 * Instants recopiés, jamais comparés à l'horloge.
 */
const CLOSED = new Date("2026-10-06T16:00:00.000Z");
const SHEET = { serviceDay: "2026-10-07", closedAt: CLOSED, logo: PAPER_LOGO };
const TRAITEUR: CatalogFamilyView = { id: "fam-tra", name: "Traiteur", position: 0 };
const VIENNOISERIES: CatalogFamilyView = { id: "fam-vien", name: "Viennoiseries", position: 1 };
const SHELVES = new Map([
  ["TRA-SAU", TRAITEUR],
  ["VIE-001", VIENNOISERIES],
]);

const croissants = (quantity: number): ProductionLineSnapshot => ({
  sku: "VIE-001",
  productName: "Croissant",
  quantity,
  saleUnit: "piece",
});
const salmon = (grams: number): ProductionLineSnapshot => ({
  sku: "TRA-SAU",
  productName: "Saumon gravlax",
  quantity: grams,
  saleUnit: "weight",
});

function order(
  orderId: string,
  lines: readonly ProductionLineSnapshot[],
  fulfillmentMethod: "pickup" | "delivery" = "pickup",
): ProductionOrderSnapshot {
  return {
    packed: null,
    orderId,
    rank: 1,
    reference: `ORD-${orderId}`,
    customerLabel: "Hôtel des Trois Ponts",
    fulfillmentMethod,
    destination: "Le Labo",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    sheetDetails: null,
    lines,
  };
}

const DAY = [
  order("1", [croissants(12), salmon(1250)]),
  order("2", [salmon(500)], "delivery"),
  order("3", [croissants(30)]),
];

describe("le dossier du jour, au poids", () => {
  it("additionne les grammes de l'article, et le compte pour une pièce par commande", () => {
    const dossier = dayDossierOf(DAY, SHELVES);

    expect(dossier.recap.map((group) => [group.label, group.quantity])).toEqual([
      ["Traiteur", 2],
      ["Viennoiseries", 42],
    ]);
    expect(dossier.recap[0]?.lines).toEqual([
      {
        sku: "TRA-SAU",
        productName: "Saumon gravlax",
        quantity: 1750,
        saleUnit: "weight",
        orderCount: 2,
        resupplyQuantity: 0,
      },
    ]);
    expect(dossier.pieces).toBe(44);
  });

  /** Régression visée : l'e-mail et l'en-tête du PDF doivent dire le même total. */
  it("dit le même nombre de pièces que l'e-mail du dossier, poids compris", () => {
    expect(dossierCountsOf(DAY, []).pieces).toBe(dayDossierOf(DAY, SHELVES).pieces);
  });

  it("ne range pas un article au poids devant les croissants à cause de ses grammes", () => {
    const dossier = dayDossierOf([order("1", [croissants(3), salmon(5000)])], new Map());

    expect(dossier.recap[0]?.lines.map((line) => line.sku)).toEqual(["VIE-001", "TRA-SAU"]);
    expect(dossier.recap[0]?.lines.map(recapPieces)).toEqual([3, 1]);
  });
});

describe("le camembert du jour, au poids", () => {
  it("compte une ligne au poids pour une part, pas pour ses grammes", () => {
    const shares = countColorSharesOf(
      [order("a", [salmon(1250)]), order("b", [croissants(3)])],
      [],
      new Map([
        ["a", "#e4572e"],
        ["b", "#2e86ab"],
      ]),
      new Map(),
    );

    expect(shares).toEqual([
      { color: "#2e86ab", quantity: 3 },
      { color: "#e4572e", quantity: 1 },
    ]);
  });
});

describe("la fiche d'atelier et le compte à produire, au poids", () => {
  it("la fiche d'une commande mêlée dit « 1,25 kg » et compte 13 pièces", async () => {
    const [page] = pdfPages(
      await renderAtelierSheetPdf(order("1", [croissants(12), salmon(1250)]), SHEET, "", null),
    );

    expect(page).toContain("1,25 kg");
    expect(page).toContain("13 pièces");
    expect(page).not.toContain("1250");
  });

  it("le compte à produire dit le poids en kilos, et ne l'additionne pas aux pièces", async () => {
    const [page] = pdfPages(
      await renderProductionCountPdf(
        [
          { ...salmon(2500), done: null },
          { ...croissants(42), done: null },
        ],
        SHEET,
        [],
      ),
    );

    expect(page).toContain("2,5 kg");
    expect(page).toContain("2 articles, 43 pièces");
    expect(page).not.toContain("2542");
  });

  it("un poids sous le kilo s'écrit en grammes, jamais « 0,5 kg »", async () => {
    const [page] = pdfPages(
      await renderProductionCountPdf([{ ...salmon(500), done: null }], SHEET, []),
    );

    expect(page).toContain("500 g");
    expect(page).not.toContain("0,5 kg");
  });
});
