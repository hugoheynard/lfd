import { toOrderView, type OrderRow } from "../prisma-order.reader.js";

/**
 * Plan L6 (`plan-l6-montants-lus.md`, § 3) : le « Total HT » d'une commande
 * se calcule ICI, par la règle du bon, sur les colonnes figées — l'écran le lit.
 */
function row(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "ord_1",
    orderNumber: "ORD-1",
    status: "placed",
    paymentStatus: "not_required",
    requestedDeliveryDate: null,
    fulfillmentMethod: "pickup",
    deliveryAddressId: null,
    deliveryAddressSnapshot: null,
    pickupAddress: null,
    fulfillment: null,
    note: "",
    subtotalCents: 10_000,
    discountCents: 1_000,
    discountAdjustment: null,
    discountLabel: null,
    voucherDiscountCents: 500,
    discountTtcCents: null,
    voucherTtcCents: null,
    deliveryFeeTtcCents: null,
    ttcByRate: null,
    deliveryFeeAdjustment: null,
    deliveryFeeCents: 300,
    lateFeeCents: 200,
    lateFeeAdjustment: null,
    deliveryVatMode: null,
    vatCents: 495,
    vatShares: null,
    // Volontairement incohérent avec le reste : le HT ne s'en déduit pas.
    totalCents: 1,
    currency: "EUR",
    companyId: "co_1",
    company: { raisonSociale: "Hôtel des Trois Ponts" },
    placedBy: { firstName: "Ana", lastName: "Roux", email: "ana@example.test" },
    fromSubscriptionId: null,
    placedByStaffId: null,
    recurringDeltas: null,
    handoverToken: null,
    confirmedAt: null,
    readyAt: null,
    handedOverAt: null,
    createdAt: new Date(0),
    lines: [],
    discounts: [],
    refunds: [],
    ...overrides,
  };
}

describe("toOrderView — le HT du bon (L6)", () => {
  it("articles moins remise et bon, plus livraison et surtaxe — jamais total moins TVA", () => {
    expect(toOrderView(row()).pretaxCents).toBe(9_000);
  });

  it("les remises ne font pas descendre les articles sous zéro ; le port et la surtaxe restent", () => {
    const view = toOrderView(row({ subtotalCents: 1_000, discountCents: 800 }));

    expect(view.pretaxCents).toBe(500);
  });
});
