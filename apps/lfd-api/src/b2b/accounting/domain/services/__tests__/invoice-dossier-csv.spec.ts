import { grams, lineTotalCents } from "@lfd/money";

import { simulateInvoiceDossier } from "../invoice-dossier.js";
import { invoiceCsv } from "../invoice-dossier-csv.js";
import { frozenOrder } from "./collection-fixtures.js";

/**
 * Le CSV de la facture simulée dit le poids (plan `plan-vente-au-poids.md`,
 * § 3 bis, point 6) : une colonne « Unité », et le kilo à trois décimales.
 */
const PLACED = new Date(0);
const HEADING = { companyName: "Maison mère", period: "du 1er au 31 octobre", inProgress: false };

describe("invoiceCsv — la vente au poids", () => {
  it("écrit « 1,250 » « kg » pour une ligne au poids, « 1 » « pièce(s) » pour le pain", () => {
    const base = frozenOrder("ORD-1", PLACED);
    const weighed = {
      sku: "GRAV-1",
      productNameSnapshot: "Saumon gravlax",
      unitPriceMillicents: 1_240_000,
      vatRate: "5.50",
      quantity: 1_250,
      saleUnit: "weight" as const,
      lineTotalCents: lineTotalCents(1_240_000, grams(1_250)),
    };
    const dossier = simulateInvoiceDossier([
      { ...base, lines: [...base.lines, weighed], vatShares: null },
    ]);

    const csv = invoiceCsv(dossier, HEADING);

    expect(csv).toContain('"Quantité";"Unité";"Montant HT (€)"');
    expect(csv).toContain('"GRAV-1";"Saumon gravlax";"12,40000";"5,5 %";1,250;"kg";15,50');
    expect(csv).toContain('"PAIN-1";"Pain";"9,48000";"5,5 %";1;"pièce(s)";9,48');
  });
});
