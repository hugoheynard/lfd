import { InvoiceIssuanceBlockedError } from "../../errors/invoice-errors.js";
import { issueInput } from "../../entities/__tests__/invoice-fixtures.js";
import { simulateInvoiceDossier } from "../invoice-dossier.js";
import { invoiceFromDossier, type InvoiceFromDossierInput } from "../invoice-from-dossier.js";
import { frozenOrder } from "./collection-fixtures.js";

/**
 * La facture émise depuis le dossier calculé (lot E1, ce qu'E4 appellera).
 * Les dates ne sont comparées qu'entre elles — jamais à l'horloge.
 */

const PLACED = new Date("2026-09-15T08:00:00.000Z");

function input(overrides: Partial<InvoiceFromDossierInput> = {}): InvoiceFromDossierInput {
  const bons = [
    { ...frozenOrder("CMD-001", PLACED), requestedDeliveryDate: "2026-09-16" },
    { ...frozenOrder("CMD-002", PLACED), discountCents: 100, deliveryFeeCents: 300 },
  ];
  const { lines: _lines, vat: _vat, ...issue } = issueInput();
  return { ...issue, computed: simulateInvoiceDossier(bons).invoice, ...overrides };
}

describe("invoiceFromDossier", () => {
  it("reprend lignes et ventilation du dossier, sans recalcul", () => {
    const given = input();
    const state = invoiceFromDossier(given).toState();
    expect(state.vat).toBe(given.computed.vat);
    expect(state.lines).toEqual([
      {
        sku: "PAIN-1",
        label: "Pain",
        unitCode: "H87",
        quantityThousandths: 2_000,
        unitPriceMillicents: 948_000,
        vatRate: 5.5,
        amountCents: 1_896,
      },
    ]);
  });

  it("porte la remise et le port dans la ventilation, et le total du dossier", () => {
    const given = input();
    const { computed } = given;
    const invoice = invoiceFromDossier(given);
    expect(invoice.totalTtcCents).toBe(computed.totalCents);
    expect(computed.vat.allowancesCents).toBe(100);
    expect(computed.vat.chargesCents).toBe(300);
  });

  it("ne reprend pas la date DEMANDÉE comme date de livraison", () => {
    const state = invoiceFromDossier(input()).toState();
    expect(state.orders.map((o) => o.deliveredOn)).toEqual(["2026-09-12", null]);
    expect(JSON.stringify(state)).not.toContain("2026-09-16");
  });

  it("refuse d'émettre pour un acheteur sans SIREN", () => {
    const { buyer } = issueInput();
    expect(() =>
      invoiceFromDossier(input({ buyer: buyer === null ? null : { ...buyer, siren: "" } })),
    ).toThrow(InvoiceIssuanceBlockedError);
  });
});
