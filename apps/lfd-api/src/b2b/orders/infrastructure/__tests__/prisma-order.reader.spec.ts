import { NO_REFUNDS } from "../order-card-refund-readings.js";
import { toOrderView, type OrderRow } from "../prisma-order.reader.js";

/**
 * Plan L6 (`le-prix-d-un-panier.md`, § 8.2) : le « Total HT » d'une commande
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
    ...overrides,
  };
}

describe("toOrderView — le HT du bon (L6)", () => {
  it("articles moins remise et bon, plus livraison et surtaxe — jamais total moins TVA", () => {
    expect(toOrderView(row(), NO_REFUNDS).pretaxCents).toBe(9_000);
  });

  it("les remises ne font pas descendre les articles sous zéro ; le port et la surtaxe restent", () => {
    const view = toOrderView(row({ subtotalCents: 1_000, discountCents: 800 }), NO_REFUNDS);

    expect(view.pretaxCents).toBe(500);
  });
});

/**
 * Plan M2, lot P1.c : les remboursements ne sont plus une relation — ils
 * viennent du bloc `card-payment`, et le cumul est celui de SA position (une
 * seule arithmétique), jamais recalculé ici depuis la liste.
 */
describe("toOrderView — les remboursements lus au bloc `card-payment` (P1.c)", () => {
  it("recopie la liste et le cumul tels que la lecture les rend", () => {
    const refunds = [
      {
        amountCents: 500,
        status: "succeeded" as const,
        refundedAt: "2030-01-10T09:00:00.000Z",
        source: "manual" as const,
      },
    ];

    const view = toOrderView(row(), { refunds, refundedCents: 700 });

    expect(view.refunds).toEqual(refunds);
    expect(view.refundedCents).toBe(700);
  });
});
