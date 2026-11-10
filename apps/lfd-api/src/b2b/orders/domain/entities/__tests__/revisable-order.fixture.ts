import type { BillingAddressPayload } from "@lfd/contracts";
import { millicentsFromCents, orderPretaxCents } from "@lfd/money";

import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order } from "../order.js";
import type { PricedDraftInput } from "../order-priced-draft.js";
import type { RevisableOrder } from "../order-revision.js";
import { draftFrom, replayedOf, type DraftSpec } from "./priced-input.fixture.js";

/**
 * La commande révisable des suites de la révision (M1, plan S2) : au compte,
 * 10 croissants, un jour de service absolu comparé seulement à lui-même.
 */

export const LABO: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

export const DAY = "2026-11-10";

export const line = (sku: string, qty: number, priceCents = 200): OrderLineInput => ({
  sku,
  productName: sku,
  unitPriceMillicents: millicentsFromCents(priceCents),
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: qty,
});

const BASE: DraftSpec = {
  companyId: "co_1",
  billedCompanyId: "co_1",
  principal: null,
  placedByStaffId: null,
  buyerKind: "registered",
  agreed: {
    window: { value: { start: "07:00", end: "08:00" }, source: "override" },
    contact: { value: null, source: "default" },
    signatureRequired: { value: false, source: "default" },
  },
  placedByUserId: "usr_1",
  fulfillment: {
    method: "pickup",
    deliveryZoneId: null,
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddress: { ...LABO, siteId: "site_1" },
  },
  requestedDeliveryDate: new Date(`${DAY}T00:00:00.000Z`),
  note: "",
  catalogVersionId: null,
  lines: [line("VIE-001", 10)],
  voucher: null,
  salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
  locale: null,
};

/** Une passation : la commande de base, modifiée. */
export function input(over: Partial<DraftSpec> = {}): PricedDraftInput {
  return draftFrom(BASE, over);
}

/** Une révision de `order` : la même entrée, ses remises rejouées. */
export function revised(order: RevisableOrder, over: Partial<DraftSpec> = {}): PricedDraftInput {
  return draftFrom(BASE, { replayed: replayedOf(order), ...over });
}

/** La commande telle que passée, d'après une entrée : au compte, 10 croissants par défaut. */
export function placed(
  over: Partial<RevisableOrder> = {},
  from: PricedDraftInput = input(),
): RevisableOrder {
  const order = Order.draft(from);
  order.deferPayment();
  const state = order.toPersistence();
  return {
    orderId: "ord_1",
    orderNumber: "ORD-1",
    revision: 0,
    vatMethod: state.vatMethod,
    companyId: state.companyId,
    billedCompanyId: state.billedCompanyId,
    principal: null,
    placedByUserId: state.placedByUserId,
    placedByStaffId: null,
    buyerKind: "registered",
    status: "placed",
    paymentStatus: "not_required",
    shortfallDecided: false,
    discountPromotionId: state.discountPromotionId,
    discountAdjustment: state.discountAdjustment,
    discountLabel: state.discountLabel,
    discountCents: state.discountCents,
    discountTtcCents: state.discountTtcCents,
    activeDiscounts: [],
    totalCents: state.totalCents,
    pretaxCents: orderPretaxCents(state),
    stripePaymentIntentId: null,
    cancelledAt: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    serviceDay: DAY,
    supply: state.supply,
    entryShortcut: state.entryShortcut,
    entryOrigin: state.entryOrigin,
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
    deliveryFeeAdjustment: state.deliveryFeeAdjustment,
    freeDeliveryThresholdCents: state.freeDelivery?.thresholdCents ?? null,
    lateFeeAdjustment: null,
    voucher: null,
    salesTerms: state.salesTerms,
    locale: null,
    catalogVersionId: null,
    customerCancellation: state.customerCancellation,
    customerCancellableUntil: state.customerCancellableUntil,
    ...over,
  };
}
