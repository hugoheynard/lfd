import { millicentsFromCents } from "@lfd/money";

import type { FixedCustomerCancellation } from "../../services/customer-cancellation-window.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { RevisableOrder } from "../order-revision.js";

/**
 * Une révision du jour ou du créneau recalcule l'instant limite avec le délai
 * figé à la passation, jamais avec le réglage du jour (Hugo, 2026-10-26).
 * Les dates sont le SUJET et ne se comparent qu'entre elles : aucune horloge
 * n'est lue (exception étroite du CLAUDE.md §5).
 */
const DAY = "2030-01-15";
const LATER_DAY = "2030-01-17";

function input(day: string, start: string): DraftOrderInput {
  return {
    companyId: null,
    billedCompanyId: null,
    principal: null,
    placedByStaffId: null,
    agreed: {
      window: { value: { start, end: "12:00" }, source: "override" },
      contact: { value: null, source: "default" },
      signatureRequired: { value: false, source: "default" },
    },
    placedByUserId: "usr_1",
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
    requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
    note: "",
    catalogVersionId: null,
    lines: [
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceMillicents: millicentsFromCents(0),
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
  };
}

/** La commande passée le 15 à 08:30, avec le délai et l'instant donnés. */
function placed(
  customerCancellation: FixedCustomerCancellation,
  customerCancellableUntil: Date | null,
): RevisableOrder {
  const order = Order.draft(input(DAY, "08:30"));
  order.deferPayment();
  const state = order.toPersistence();
  return {
    orderId: "ord_1",
    orderNumber: "ORD-1",
    revision: 0,
    vatMethod: state.vatMethod,
    companyId: null,
    billedCompanyId: null,
    principal: null,
    placedByUserId: "usr_1",
    placedByStaffId: null,
    status: "placed",
    paymentStatus: "not_required",
    shortfallDecided: false,
    totalCents: state.totalCents,
    stripePaymentIntentId: null,
    cancelledAt: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    serviceDay: DAY,
    fulfillment: {
      method: state.fulfillmentMethod,
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: state.pickupAddress,
    },
    agreed: state.agreed,
    note: "",
    lines: state.lines,
    deliveryVatMode: state.deliveryVatMode,
    lateFeeAdjustment: null,
    voucher: null,
    salesTerms: state.salesTerms,
    locale: null,
    catalogVersionId: null,
    customerCancellation,
    customerCancellableUntil,
  };
}

function revisedTo(current: RevisableOrder, day: string, start: string) {
  const { state } = Order.revise(current, input(day, start));
  return {
    fixed: state.customerCancellation,
    until: state.customerCancellableUntil,
  };
}

describe("Order.revise — le délai d'annulation figé", () => {
  it("un nouveau créneau : l'instant recalculé avec le délai d'ORIGINE (48 h)", () => {
    // Passée sous 48 h ; le réglage du jour (quel qu'il soit) n'est pas lu.
    const current = placed({ kind: "delay", hoursBefore: 48 }, new Date("2030-01-13T07:30:00Z"));

    // 17 janvier 10:00 à Paris = 09:00 UTC ; 48 h avant.
    expect(revisedTo(current, LATER_DAY, "10:00")).toEqual({
      fixed: { kind: "delay", hoursBefore: 48 },
      until: new Date("2030-01-15T09:00:00.000Z"),
    });
  });

  it("figée sans délai : le reste après la révision, sans instant", () => {
    const current = placed({ kind: "no_delay" }, null);

    expect(revisedTo(current, LATER_DAY, "10:00")).toEqual({
      fixed: { kind: "no_delay" },
      until: null,
    });
  });

  it("non figée (d'avant les colonnes) : le reste, sans instant", () => {
    const current = placed({ kind: "not_fixed" }, null);

    expect(revisedTo(current, LATER_DAY, "10:00")).toEqual({
      fixed: { kind: "not_fixed" },
      until: null,
    });
  });

  it("instant seul (passée entre les deux migrations) : son délai relu sur l'ancre, puis figé", () => {
    // 15 janvier 08:30 Paris = 07:30 UTC ; l'instant figé est 24 h avant.
    const current = placed({ kind: "not_fixed" }, new Date("2030-01-14T07:30:00Z"));

    expect(revisedTo(current, LATER_DAY, "10:00")).toEqual({
      fixed: { kind: "delay", hoursBefore: 24 },
      until: new Date("2030-01-16T09:00:00.000Z"),
    });
  });
});
