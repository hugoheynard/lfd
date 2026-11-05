import type { BillingAddressPayload, CartAdjustment } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { PricedDraftInput } from "../order-priced-draft.js";
import type { RevisableOrder } from "../order-revision.js";
import type { RevisableDiscount } from "../../services/basket-discount-replay.js";
import type { FrozenDiscountTerms } from "../../services/frozen-discount-terms.js";
import { pricedInput, replayedOf, type OrderIdentity } from "./priced-input.fixture.js";

/**
 * Une commande passée avec une remise de panier, et sa révision — la
 * fixture des suites L9 (`order-revision-promotion.spec.ts`,
 * `order-revision-slot-hours.spec.ts`). Jour de service absolu, jamais
 * comparé à une horloge (exception étroite du CLAUDE.md §5).
 */

export const DAY = "2030-03-12";
export const POINT: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};
export const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1_000 };
/** 10 croissants à 2 € HT. */
export const SUBTOTAL_CENTS = 2_000;

export interface Discount {
  readonly adjustment: CartAdjustment | null;
  readonly promotionId: string | null;
}
export const NONE: Discount = { adjustment: null, promotionId: null };

export const DELIVERY: DraftOrderInput["fulfillment"] = {
  method: "delivery",
  deliveryZoneId: "zone_1",
  deliveryAddress: POINT,
  deliveryAddressId: null,
  pickupAddress: null,
};

/** 10 croissants à 2 € HT : la ligne que les remises couvrent. */
export const CROISSANTS: readonly OrderLineInput[] = [
  {
    sku: "VIE-001",
    productName: "Croissant",
    unitPriceMillicents: millicentsFromCents(200),
    vatRate: 5.5,
    saleUnit: "piece",
    quantity: 10,
  },
];

/** L'identité de la commande, au point `siteId` ou à l'acheminement donné. */
export function identity(
  siteId: string,
  fulfillment?: DraftOrderInput["fulfillment"],
): OrderIdentity {
  return {
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
    fulfillment: fulfillment ?? {
      method: "pickup",
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddress: { ...POINT, label: siteId, siteId },
    },
    requestedDeliveryDate: new Date(`${DAY}T00:00:00.000Z`),
    note: "",
    catalogVersionId: null,
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
  };
}

/** La promotion panier qui produit cette remise, au retrait comme en livraison. */
function promotionsOf(discount: Discount): readonly LivePromotion[] {
  const { adjustment } = discount;
  if (adjustment === null) {
    return [];
  }
  return [
    livePromotion({
      id: discount.promotionId ?? "promo_sans_id",
      label: "Remise panier",
      effect:
        adjustment.mode === "percent"
          ? { kind: "percent_off", basisPoints: adjustment.bp }
          : { kind: "basket_amount_off", cents: adjustment.cents },
      fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
    }),
  ];
}

/** La passation : la remise vient d'une promotion vivante, chiffrée par l'agrégat. */
export function input(
  siteId: string,
  discount: Discount,
  fulfillment?: DraftOrderInput["fulfillment"],
): PricedDraftInput {
  return pricedInput(identity(siteId, fulfillment), {
    lines: CROISSANTS,
    promotions: promotionsOf(discount),
  });
}

/**
 * La révision de `order` : ses remises REJOUÉES (plan des remises acquises,
 * § 10.2), jamais rejugées — aucune promotion vivante n'y entre.
 */
export function revisedInput(
  order: RevisableOrder,
  siteId: string,
  fulfillment?: DraftOrderInput["fulfillment"],
  lines: readonly OrderLineInput[] = CROISSANTS,
): PricedDraftInput {
  return pricedInput(identity(siteId, fulfillment), { lines, replayed: replayedOf(order) });
}

/** La commande passée au site `site_a` avec cette remise ; `frozenId` simule une commande d'avant L9. */
export function placed(
  discount: Discount,
  frozenId: string | null = discount.promotionId,
  delivered?: DraftOrderInput["fulfillment"],
): RevisableOrder {
  const order = Order.draft(input("site_a", discount, delivered));
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
    discountPromotionId: frozenId,
    discountAdjustment: state.discountAdjustment,
    discountLabel: state.discountLabel,
    discountCents: state.discountCents,
    discountTtcCents: state.discountTtcCents,
    activeDiscounts: [],
    totalCents: state.totalCents,
    stripePaymentIntentId: null,
    cancelledAt: null,
    refunds: { refundableCents: 0, inFlightCents: 0 },
    serviceDay: DAY,
    supply: state.supply,
    entryShortcut: state.entryShortcut,
    entryOrigin: state.entryOrigin,
    fulfillment: delivered ?? {
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
    lateFeeAdjustment: null,
    voucher: null,
    salesTerms: state.salesTerms,
    locale: null,
    catalogVersionId: null,
    customerCancellation: state.customerCancellation,
    customerCancellableUntil: state.customerCancellableUntil,
  };
}

export const PROMO_A: Discount = { adjustment: TEN_PERCENT, promotionId: "promo_a" };

/** Des termes figés : cumulable non, sans seuil, à cette cible. */
export function terms(
  pickup: FrozenDiscountTerms["pickup"],
  delivery: FrozenDiscountTerms["delivery"],
): FrozenDiscountTerms {
  return { cumulative: false, minQuantity: null, pickup, delivery, origin: "placed", hours: null };
}

/** La commande, avec ses remises actives relues en table et leurs termes figés. */
export function withActive(
  discount: Discount,
  active: readonly {
    readonly promotionId: string | null;
    readonly terms: FrozenDiscountTerms | null;
    readonly label?: string;
  }[],
  delivered?: DraftOrderInput["fulfillment"],
): RevisableOrder {
  return {
    ...placed(discount, discount.promotionId, delivered),
    activeDiscounts: active.map((one, index): RevisableDiscount => ({
      orderDiscountId: `od_${String(index + 1)}`,
      promotionId: one.promotionId,
      adjustment: TEN_PERCENT,
      label: one.label ?? null,
      servedLabel: null,
      coveredSkus: ["VIE-001"],
      amountCents: 200,
      amountTtcCents: null,
      terms: one.terms,
    })),
  };
}

export const ONLY_SITE_A = terms({ points: ["site_a"] }, "none");
export const ALL_POINTS_AND_ZONES = terms("all", "all");
