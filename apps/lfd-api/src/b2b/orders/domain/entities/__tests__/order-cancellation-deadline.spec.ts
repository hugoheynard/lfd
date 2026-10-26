import { millicentsFromCents } from "@lfd/money";

import type { FixedCustomerCancellation } from "../../services/customer-cancellation-window.js";
import { Order, type DraftOrderInput } from "../order.js";

/**
 * Le délai d'annulation figé à la passation (Hugo, 2026-10-26). Les dates
 * sont le SUJET et ne se comparent qu'entre elles — l'agrégat ne lit aucune
 * horloge ici (exception étroite du CLAUDE.md §5).
 */
const DELAY_24 = { delayEnabled: true, hoursBefore: 24 };

function draftInput(over: Partial<DraftOrderInput> = {}): DraftOrderInput {
  return {
    companyId: null,
    billedCompanyId: null,
    principal: null,
    placedByStaffId: null,
    agreed: {
      window: { value: { start: "08:30", end: "10:00" }, source: "override" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    placedByUserId: "user_1",
    fulfillment: {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: {
        label: "",
        ligne1: "1 rue du Test",
        ligne2: "",
        codePostal: "73000",
        ville: "Chambéry",
        pays: "France",
      },
    },
    // Composé comme `OrderComposition` le fait : minuit UTC du jour.
    requestedDeliveryDate: new Date("2030-01-15"),
    note: "",
    catalogVersionId: null,
    lines: [
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceMillicents: millicentsFromCents(200),
        vatRate: 5.5,
        quantity: 1,
      },
    ],
    discountCents: 0,
    discountAdjustment: null,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTerms", revision: null, fileId: null },
    locale: null,
    ...over,
  };
}

function untilOf(
  policy: { readonly delayEnabled: boolean; readonly hoursBefore: number } | null,
  over: Partial<DraftOrderInput> = {},
): Date | null {
  const order = Order.draft(draftInput(over));
  if (policy !== null) {
    order.fixCustomerCancellationDeadline(policy);
  }
  order.deferPayment();
  return order.toPersistence().customerCancellableUntil;
}

function fixedOf(
  policy: { readonly delayEnabled: boolean; readonly hoursBefore: number } | null,
  over: Partial<DraftOrderInput> = {},
): FixedCustomerCancellation {
  const order = Order.draft(draftInput(over));
  if (policy !== null) {
    order.fixCustomerCancellationDeadline(policy);
  }
  order.deferPayment();
  return order.toPersistence().customerCancellation;
}

describe("Order — le délai d'annulation figé à la passation", () => {
  it("un particulier : N heures avant le début du créneau, heure de Paris", () => {
    // 15 janvier 08:30 à Paris = 07:30 UTC ; 24 h avant.
    expect(untilOf(DELAY_24)).toEqual(new Date("2030-01-14T07:30:00.000Z"));
  });

  it("suit le délai du réglage du moment", () => {
    expect(untilOf({ delayEnabled: true, hoursBefore: 48 })).toEqual(
      new Date("2030-01-13T07:30:00.000Z"),
    );
  });

  it("sans début de créneau : minuit du jour (Q-C6.4)", () => {
    const agreed = {
      window: { value: null, source: "default" as const },
      contact: { value: null, source: "default" as const },
      signatureRequired: { value: false, source: "default" as const },
    };
    expect(untilOf(DELAY_24, { agreed })).toEqual(new Date("2030-01-13T23:00:00.000Z"));
  });

  it("un pro n'a pas de délai à figer : il annule jusqu'à l'arrêt du plan", () => {
    expect(untilOf(DELAY_24, { companyId: "co_1" })).toBeNull();
  });

  it("réglage sans délai : pas d'instant, seul l'arrêt du plan limite", () => {
    expect(untilOf({ delayEnabled: false, hoursBefore: 24 })).toBeNull();
  });

  it("fige le délai lui-même, « sans délai » compris (2026-10-26)", () => {
    expect(fixedOf(DELAY_24)).toEqual({ kind: "delay", hoursBefore: 24 });
    expect(fixedOf({ delayEnabled: false, hoursBefore: 24 })).toEqual({ kind: "no_delay" });
  });

  it("un pro et la saisie de l'équipe restent non figés", () => {
    expect(fixedOf(DELAY_24, { companyId: "co_1" })).toEqual({ kind: "not_fixed" });
    expect(fixedOf(null)).toEqual({ kind: "not_fixed" });
  });

  it("une commande sans date n'a pas d'instant", () => {
    expect(untilOf(DELAY_24, { requestedDeliveryDate: null })).toBeNull();
  });

  it("jamais posé : nul (la saisie de l'équipe ne l'appelle pas)", () => {
    expect(untilOf(null)).toBeNull();
  });
});
