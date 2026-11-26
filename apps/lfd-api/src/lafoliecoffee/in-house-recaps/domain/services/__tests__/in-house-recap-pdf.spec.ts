import { pdfText } from "../../../../orders/domain/services/__tests__/pdf-text.js";
import {
  inHouseRecapDocumentKey,
  inHouseRecapFileName,
  type InHouseRecapPdfInput,
  recapMonthLabel,
  renderInHouseRecapPdf,
} from "../in-house-recap-pdf.js";

/**
 * Le PDF du récapitulatif des BL (D7, D10) : son en-tête, son tableau, ses
 * BL, et l'ABSENCE de tout montant. Les dates sont des données, jamais
 * comparées à l'horloge.
 */

/** Le « € » tel que `pdfText` le relit (WinAnsi 0x80 décodé en latin1). */
const EURO = "\u0080";

const INPUT: InHouseRecapPdfInput = {
  number: "RBL-202610-0001",
  payerName: "Restaurant du Port",
  month: "2026-10",
  issuedAt: new Date("2026-11-01T00:30:00.000Z"),
  replacesNumber: null,
  lines: [
    { sku: "CROI", productName: "Croissant", saleUnit: "piece", quantity: 240 },
    { sku: "PAIN", productName: "Pain de campagne", saleUnit: "weight", quantity: 12_500 },
  ],
  notes: [
    { number: "ORD-1-BL1", handedOverAt: new Date("2026-10-03T08:00:00.000Z") },
    { number: "ORD-2-BL2", handedOverAt: new Date("2026-10-21T08:00:00.000Z") },
  ],
};

describe("le PDF du récapitulatif des BL", () => {
  it("porte le payeur, le mois, le numéro et la mention interne", async () => {
    const pdf = await renderInHouseRecapPdf(INPUT);
    const text = pdfText(pdf);

    expect(pdf.toString("latin1", 0, 5)).toBe("%PDF-");
    expect(text).toContain("Restaurant du Port");
    expect(text).toContain("octobre 2026");
    expect(text).toContain("RBL-202610-0001");
    expect(text).toContain("Document interne");
    expect(text).toContain("sans facturation");
  });

  it("liste chaque produit avec son unité et sa quantité totale, puis les BL couverts", async () => {
    const text = pdfText(await renderInHouseRecapPdf(INPUT));

    expect(text).toContain("Croissant");
    expect(text).toContain("240");
    expect(text).toContain("Pain de campagne");
    expect(text).toContain("au poids");
    expect(text).toContain("12,5 kg");
    expect(text).toContain("ORD-1-BL1");
    expect(text).toContain("remis le 3 octobre 2026");
    expect(text).toContain("ORD-2-BL2");
  });

  it("n'imprime aucun montant", async () => {
    const text = pdfText(await renderInHouseRecapPdf(INPUT));

    expect(text).not.toContain(EURO);
    expect(text).not.toMatch(/total TTC|HT\b/u);
  });

  it("un rectificatif dit quel numéro il remplace", async () => {
    const first = pdfText(await renderInHouseRecapPdf(INPUT));
    const rectified = pdfText(
      await renderInHouseRecapPdf({
        ...INPUT,
        number: "RBL-202610-0002",
        replacesNumber: "RBL-202610-0001",
      }),
    );

    expect(first).not.toContain("remplace");
    expect(rectified).toContain("remplace le récapitulatif RBL-202610-0001");
  });

  it("est déterministe : les mêmes données rendent les mêmes octets", async () => {
    const [left, right] = await Promise.all([
      renderInHouseRecapPdf(INPUT),
      renderInHouseRecapPdf(INPUT),
    ]);
    expect(left.equals(right)).toBe(true);
  });

  it("tourne la page quand les produits ne tiennent plus, sans en perdre un", async () => {
    const lines = Array.from({ length: 60 }, (_, index) => ({
      sku: `SKU-${String(index)}`,
      productName: `Produit ${String(index)}`,
      saleUnit: "piece",
      quantity: index + 1,
    }));
    const text = pdfText(await renderInHouseRecapPdf({ ...INPUT, lines }));

    expect(text).toContain("Produit 0");
    expect(text).toContain("Produit 59");
    expect(text).toContain("Page 2 / ");
  });
});

describe("le nom et la clé du PDF", () => {
  it("se tirent du numéro et du payeur", () => {
    expect(inHouseRecapFileName("RBL-202610-0001")).toBe("RBL-202610-0001.pdf");
    expect(inHouseRecapDocumentKey({ payerId: "co_1", number: "RBL-202610-0001" })).toBe(
      "in-house-recaps/co_1/RBL-202610-0001.pdf",
    );
  });

  it("le mois se dit en toutes lettres", () => {
    expect(recapMonthLabel("2026-01")).toBe("janvier 2026");
    expect(recapMonthLabel("2026-12")).toBe("décembre 2026");
  });
});
