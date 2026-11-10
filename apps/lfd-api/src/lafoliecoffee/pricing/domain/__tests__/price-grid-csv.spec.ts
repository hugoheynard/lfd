import { CSV_BOM } from "../../../../platform/csv/csv-cells.js";
import {
  adjustmentText,
  PRICE_GRID_NOTICE,
  priceGridCsv,
  priceGridFileName,
  type PriceGridHeading,
} from "../price-grid-csv.js";
import type { PriceGridRow } from "../price-grid-row.js";

/** **La grille de prix en CSV** (`plan-export-grille-de-prix.md`, § 3) — pure. */

const HEADING: PriceGridHeading = {
  audience: "Particuliers inscrits",
  day: "01/12/2026",
  fulfillment: "Retrait — Cœur de station",
  basis: "ttc",
  remarks: [],
  displayedPromotions: ["−10 % sur les viennoiseries"],
  basketPromotions: [
    { label: "Retrait −20 %", part: "column" },
    { label: "Comptes −5 %", part: "net" },
    { label: "Livraison offerte", part: "ignored" },
  ],
  pricePerKg: true,
};

const ROW: PriceGridRow = {
  sku: "VIE-001-1",
  familyName: "Viennoiseries",
  productName: "Croissant",
  variantName: "Croissant; pur beurre",
  saleUnit: "piece",
  baseCents: 150,
  displayedCents: 135,
  columns: [{ mode: "percent", bp: 2000 }],
  netCents: 128,
  enteredPerKgCents: null,
};

function linesOf(csv: string): readonly string[] {
  return csv.slice(CSV_BOM.length).split("\r\n");
}

describe("la grille de prix en CSV", () => {
  it("écrit en tête, après l'assiette, ce que le contexte dit de ce public (§ 8.6)", () => {
    const remarks = ["Pro type, aucune société : hors articles réservés.", "Projection."];
    const lines = linesOf(priceGridCsv({ ...HEADING, remarks }, []));

    expect(lines[4]).toBe(`"${remarks[0] ?? ""}"`);
    expect(lines[5]).toBe(`"${remarks[1] ?? ""}"`);
    expect(lines).toContain(`"${PRICE_GRID_NOTICE}"`);
  });

  it("commence par le BOM et finit par CRLF", () => {
    const csv = priceGridCsv(HEADING, [ROW]);

    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("dit en tête le public, la date, l'acheminement, les promotions et la mention", () => {
    const head = linesOf(priceGridCsv(HEADING, [])).slice(0, 7).join("\n");

    expect(head).toContain("Particuliers inscrits");
    expect(head).toContain("01/12/2026");
    expect(head).toContain("Retrait — Cœur de station");
    expect(head).toContain("Prix TTC");
    expect(head).toContain("−10 % sur les viennoiseries");
    expect(head).toContain("Retrait −20 % (colonne à part)");
    expect(head).toContain("Comptes −5 % (dans le prix net estimé)");
    expect(head).toContain("Livraison offerte (ignorée)");
    expect(head).toContain(PRICE_GRID_NOTICE);
  });

  it("une colonne par remise « à part », le net estimé, le kilo en option", () => {
    const header = linesOf(priceGridCsv(HEADING, [ROW]))[8];

    expect(header).toBe(
      '"Famille";"Produit";"Déclinaison";"SKU";"Unité";"Prix de base TTC";"Prix affiché TTC";' +
        '"Retrait −20 % (remise au panier)";"Prix net estimé TTC";"Prix au kilo saisi TTC"',
    );
  });

  it("virgule décimale, point-virgule, cellule vide pour ce qui n'est pas concerné", () => {
    const row = linesOf(priceGridCsv(HEADING, [{ ...ROW, columns: [null] }]))[9];

    expect(row).toBe(
      '"Viennoiseries";"Croissant";"Croissant; pur beurre";"VIE-001-1";"pièce";1,50;1,35;;1,28;',
    );
  });

  it("sans remise au net ni option kilo : « Prix net », et pas de colonne kilo", () => {
    const header = linesOf(
      priceGridCsv({ ...HEADING, basis: "ht", basketPromotions: [], pricePerKg: false }, []),
    )[8];

    expect(header).toBe(
      '"Famille";"Produit";"Déclinaison";"SKU";"Unité";"Prix de base HT";"Prix affiché HT";"Prix net HT"',
    );
  });

  it("un article au poids se dit au kilo", () => {
    const row = linesOf(priceGridCsv(HEADING, [{ ...ROW, saleUnit: "weight" }]))[9];

    expect(row).toContain('"kilo"');
  });

  it("écrit une remise comme elle est saisie", () => {
    expect(adjustmentText({ mode: "percent", bp: 2000 })).toBe("20 %");
    expect(adjustmentText({ mode: "percent", bp: 1250 })).toBe("12,5 %");
    expect(adjustmentText({ mode: "percent", bp: 1205 })).toBe("12,05 %");
    expect(adjustmentText({ mode: "amount", cents: 500 })).toBe("5,00 € HT");
  });

  it("nomme le fichier grille-<public>-<date>.csv", () => {
    expect(priceGridFileName("Particuliers inscrits", "2026-12-01")).toBe(
      "grille-particuliers-inscrits-2026-12-01.csv",
    );
    expect(priceGridFileName("Boulangerie Élise & fils", "2026-12-01")).toBe(
      "grille-boulangerie-elise-fils-2026-12-01.csv",
    );
  });
});
