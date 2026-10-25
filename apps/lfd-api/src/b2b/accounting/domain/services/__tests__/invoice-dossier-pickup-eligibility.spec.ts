import { COMPANY_DISCOUNT, simulateInvoiceDossier } from "../invoice-dossier.js";
import type { FrozenInvoiceLine, FrozenInvoiceOrder } from "../invoice-dossier.types.js";
import { aggregateInvoiceLines } from "../invoice-lines.js";

/**
 * La facture d'un cycle dont des lignes étaient exclues de la remise de
 * retrait (V3 du plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 * Aucune date n'est comparée à une horloge.
 */
const PAIN: FrozenInvoiceLine = {
  sku: "PAI-001",
  productNameSnapshot: "Pain",
  unitPriceMillicents: 100_000,
  vatRate: "5.50",
  quantity: 10,
  lineTotalCents: 1_000,
};
const JUS: FrozenInvoiceLine = {
  sku: "BOI-001",
  productNameSnapshot: "Jus",
  unitPriceMillicents: 100_000,
  vatRate: "20.00",
  quantity: 10,
  lineTotalCents: 1_000,
  pickupDiscountEligible: false,
};

/** −10 % sur le pain seul : 100 de remise, TVA 50 + 200, le bon tel que la caisse le fige. */
function bon(reference: string, lines: readonly FrozenInvoiceLine[]): FrozenInvoiceOrder {
  return {
    reference,
    createdAt: new Date(0),
    requestedDeliveryDate: null,
    lines,
    discountCents: 100,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: [
      { rate: 5.5, amountCents: 50 },
      { rate: 20, amountCents: 200 },
    ],
    vatCents: 250,
    totalCents: 2_000 - 100 + 250,
  };
}

describe("la facture — la remise de retrait sur ses lignes éligibles", () => {
  it("ne répartit la remise que sur les lignes qui y étaient éligibles", () => {
    const dossier = simulateInvoiceDossier([bon("ORD-1", [PAIN, JUS])]);

    const parts = dossier.invoice.vat.categories.map((category) => [
      category.rate,
      category.allowances.find((part) => part.key === COMPANY_DISCOUNT)?.amountCents,
    ]);
    expect(parts).toEqual([
      [5.5, 100],
      [20, 0],
    ]);
    // La facture retombe sur le bon : aucun écart à expliquer.
    expect(dossier.differenceCents).toBe(0);
  });

  /** Sans l'éligibilité dans la clé, les deux lignes fusionnaient et la remise s'y répartissait. */
  it("ne fond pas une ligne exclue dans une ligne éligible du même produit", () => {
    const exclu = { ...PAIN, pickupDiscountEligible: false };

    const lines = aggregateInvoiceLines([bon("ORD-1", [PAIN]), bon("ORD-2", [exclu])]);

    expect(lines.map((line) => [line.sku, line.pickupDiscountEligible ?? true])).toEqual([
      ["PAI-001", true],
      ["PAI-001", false],
    ]);
  });
});
