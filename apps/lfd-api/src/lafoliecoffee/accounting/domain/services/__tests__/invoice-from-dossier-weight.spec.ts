import { composeTtcOrder, grams, lineTotalCents } from "@lfd/money";

import { issueInput } from "../../entities/__tests__/invoice-fixtures.js";
import { simulateInvoiceDossier } from "../invoice-dossier.js";
import type { FrozenInvoiceLine, FrozenInvoiceOrder } from "../invoice-dossier.types.js";
import { invoiceFromDossier } from "../invoice-from-dossier.js";
import { renderFacturXml } from "../facturx-xml.js";
import { frozenOrder } from "./collection-fixtures.js";

/**
 * L'émission d'une facture au poids (plan `vente-au-poids.md`, § 3 bis) :
 * les grammes passent en millièmes de KGM sans être multipliés par mille, et
 * le prix net est rattrapé quand les arrondis des bons l'écartent du montant.
 * Les dates ne sont comparées qu'entre elles.
 */

const PLACED = new Date("2026-09-15T08:00:00.000Z");
const PER_KILO = 1_234_567;

function weightLine(weightGrams: number, amountCents: number): FrozenInvoiceLine {
  return {
    sku: "GRAV-1",
    productNameSnapshot: "Saumon gravlax",
    unitPriceMillicents: PER_KILO,
    vatRate: "5.50",
    quantity: weightGrams,
    saleUnit: "weight",
    lineTotalCents: amountCents,
  };
}

/** Un bon pro : le pain du fixture partagé, et une ligne au poids à côté. */
function mixedBon(reference: string, weightGrams: number): FrozenInvoiceOrder {
  const base = frozenOrder(reference, PLACED);
  const weighed = weightLine(weightGrams, lineTotalCents(PER_KILO, grams(weightGrams)));
  return {
    ...base,
    lines: [...base.lines, weighed],
    vatShares: null,
    totalCents: base.totalCents + weighed.lineTotalCents,
  };
}

function issued(bons: readonly FrozenInvoiceOrder[]) {
  const { lines: _lines, vat: _vat, ...issue } = issueInput();
  return invoiceFromDossier({ ...issue, computed: simulateInvoiceDossier(bons).invoice }).toState();
}

describe("invoiceFromDossier — la vente au poids", () => {
  it("1 250 g partent en 1 250 millièmes de KGM, au prix des bons, à côté du pain en H87", () => {
    const state = issued([mixedBon("ORD-1", 1_250)]);

    expect(state.lines.map((l) => [l.sku, l.unitCode, l.quantityThousandths])).toEqual([
      ["GRAV-1", "KGM", 1_250],
      ["PAIN-1", "H87", 1_000],
    ]);
    expect(state.lines[0]).toMatchObject({ unitPriceMillicents: PER_KILO, amountCents: 1_543 });
  });

  // Avant le § 18.6 (plan `plan-remise-par-ligne.md`), ces trente bons
  // faisaient une ligne à un prix dérivé (12,34765 €/kg) que personne n'avait
  // payé ; ils font désormais une ligne par bon, au prix des bons, même total.
  it("une facture du mois de 30 bons au poids : une ligne par bon, au prix des bons, total Σ des bons", () => {
    const bons = Array.from({ length: 30 }, (_, i) => mixedBon(`ORD-${String(i)}`, 1_001));
    const weighed = issued(bons).lines.filter((l) => l.unitCode === "KGM");

    expect(weighed).toHaveLength(30);
    expect(
      weighed.every((l) => l.unitPriceMillicents === PER_KILO && l.amountCents === 1_236),
    ).toBe(true);
    expect(weighed.reduce((total, l) => total + l.amountCents, 0)).toBe(30 * 1_236);
  });

  it("un particulier, 50 kg : le HT payé fait foi, le prix net en est dérivé", () => {
    const ht =
      composeTtcOrder({
        lines: [{ unitMillicents: PER_KILO, quantity: grams(50_000), vatRate: 5.5 }],
      }).lines[0]?.htCents ?? Number.NaN;
    const base = frozenOrder("ORD-P", PLACED);
    const bon = { ...base, lines: [weightLine(50_000, ht)], vatShares: null };

    const [line] = issued([bon]).lines;

    expect(line).toMatchObject({
      unitCode: "KGM",
      quantityThousandths: 50_000,
      amountCents: 61_706,
      unitPriceMillicents: 1_234_120,
    });
  });
});

describe("le XML Factur-X d'une facture au poids", () => {
  it("écrit BT-129 en kilogrammes au gramme près, unitCode KGM, et aucun BasisQuantity", () => {
    const { lines: _lines, vat: _vat, ...issue } = issueInput();
    const invoice = invoiceFromDossier({
      ...issue,
      computed: simulateInvoiceDossier([mixedBon("ORD-1", 1_001)]).invoice,
    });

    const xml = renderFacturXml(invoice);

    expect(xml).toContain('<ram:BilledQuantity unitCode="KGM">1.001</ram:BilledQuantity>');
    expect(xml).toContain('<ram:BilledQuantity unitCode="H87">1</ram:BilledQuantity>');
    expect(xml).toContain("<ram:ChargeAmount>12.34567</ram:ChargeAmount>");
    expect(xml).not.toContain("BasisQuantity");
  });
});
