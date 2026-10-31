import { discountCentsOf, type BillingAddressPayload, type CartAdjustment } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { FulfillmentChangeAltersPromotionError } from "../../errors/fulfillment-promotion-errors.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { RevisableOrder } from "../order-revision.js";
import type { RevisableDiscount } from "../../services/basket-discount-replay.js";
import type { FrozenDiscountTerms } from "../../services/frozen-discount-terms.js";

/**
 * **L9 — changer d'acheminement ne change pas la promotion** (`documentation/promotions/promotions.md`, § 2.6),
 * jugé depuis le plan des remises acquises (§ 10.2) contre la **cible figée**
 * de chaque remise : la révision rejoue les remises, elle ne les rejuge plus,
 * et la comparaison rang par rang du lot M3 n'a plus d'objet.
 *
 * Jour de service absolu, jamais comparé à une horloge (exception étroite du
 * CLAUDE.md §5).
 */

const DAY = "2030-03-12";
const POINT: BillingAddressPayload = {
  label: "Labo",
  ligne1: "5 rue du Four",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};
const TEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1_000 };
/** 10 croissants à 2 € HT. */
const SUBTOTAL_CENTS = 2_000;

interface Discount {
  readonly adjustment: CartAdjustment | null;
  readonly promotionId: string | null;
}
const NONE: Discount = { adjustment: null, promotionId: null };

const DELIVERY: DraftOrderInput["fulfillment"] = {
  method: "delivery",
  deliveryZoneId: "zone_1",
  deliveryAddress: POINT,
  deliveryAddressId: null,
  pickupAddress: null,
};

function input(
  siteId: string,
  discount: Discount,
  fulfillment?: DraftOrderInput["fulfillment"],
): DraftOrderInput {
  const adjustment = discount.adjustment;
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
    lines: [
      {
        sku: "VIE-001",
        productName: "Croissant",
        unitPriceMillicents: millicentsFromCents(200),
        vatRate: 5.5,
        saleUnit: "piece",
        quantity: 10,
      },
    ],
    discountCents: adjustment === null ? 0 : discountCentsOf(adjustment, SUBTOTAL_CENTS),
    discountAdjustment: adjustment,
    discountPromotionId: discount.promotionId,
    deliveryFeeCents: 0,
    deliveryFeeAdjustment: null,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    deliveryVatMode: "standard",
    voucher: null,
    salesTerms: { document: "salesTermsPro", revision: null, fileId: null },
    locale: null,
  };
}

/** La commande passée au site `site_a` avec cette remise ; `frozenId` simule une commande d'avant L9. */
function placed(
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
    lateFeeAdjustment: null,
    voucher: null,
    salesTerms: state.salesTerms,
    locale: null,
    catalogVersionId: null,
    customerCancellation: state.customerCancellation,
    customerCancellableUntil: state.customerCancellableUntil,
  };
}

const PROMO_A: Discount = { adjustment: TEN_PERCENT, promotionId: "promo_a" };

/** Des termes figés : cumulable non, sans seuil, à cette cible. */
function terms(
  pickup: FrozenDiscountTerms["pickup"],
  delivery: FrozenDiscountTerms["delivery"],
): FrozenDiscountTerms {
  return { cumulative: false, minQuantity: null, pickup, delivery, origin: "placed" };
}

/** La commande, avec ses remises actives relues en table et leurs termes figés. */
function withActive(
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

const ONLY_SITE_A = terms({ points: ["site_a"] }, "none");
const ALL_POINTS_AND_ZONES = terms("all", "all");

describe("Order.revise — l'acheminement change : jugé contre la cible figée (L9, § 10.2)", () => {
  it("fige l'identifiant de la promotion panier sur la commande", () => {
    const order = Order.draft(input("site_a", PROMO_A));
    order.deferPayment();

    expect(order.toPersistence().discountPromotionId).toBe("promo_a");
  });

  it("refuse un point que la cible figée ne nomme pas, en nommant le geste de sortie", () => {
    const order = withActive(PROMO_A, [
      { promotionId: "promo_a", terms: ONLY_SITE_A, label: "Remise du Labo" },
    ]);
    const attempt = () => Order.revise(order, input("site_b", PROMO_A));

    expect(attempt).toThrow(FulfillmentChangeAltersPromotionError);
    expect(attempt).toThrow(
      /retirerait la promotion « Remise du Labo ».*annulez la commande et repassez-la/,
    );
  });

  it("accepte un autre point quand la cible figée vise tous les points", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: ALL_POINTS_AND_ZONES }]);
    const revision = Order.revise(order, input("site_b", PROMO_A));

    expect(revision.changes).toContain("pickup_point");
    expect(revision.state.discountPromotionId).toBe("promo_a");
  });

  it("refuse le passage à la livraison quand la cible ne livre pas", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: ONLY_SITE_A }]);

    expect(() => Order.revise(order, input("site_a", PROMO_A, DELIVERY))).toThrow(
      /retirerait la promotion/,
    );
  });

  it("accepte le passage à la livraison quand la cible livre partout", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: ALL_POINTS_AND_ZONES }]);
    const revision = Order.revise(order, input("site_a", PROMO_A, DELIVERY));

    expect(revision.changes).toContain("method");
    expect(revision.state.discountPromotionId).toBe("promo_a");
  });

  it("accepte un changement de point sans promotion ni avant ni après", () => {
    expect(Order.revise(placed(NONE), input("site_b", NONE)).changes).toContain("pickup_point");
  });

  it("ne juge pas une révision qui garde l'acheminement, même sans termes figés", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: null }]);
    const kept = { ...input("site_a", PROMO_A), note: "Sonner deux fois" };

    expect(Order.revise(order, kept).changes).toEqual(["note"]);
  });

  it("refuse un changement d'acheminement quand la cible n'est pas figée (remise pas encore reprise)", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: null }]);

    expect(() => Order.revise(order, input("site_b", PROMO_A))).toThrow(/retirerait la promotion/);
  });

  it("refuse aussi une commande sans ligne en table : les colonnes ne disent pas la cible", () => {
    expect(() => Order.revise(placed(PROMO_A), input("site_b", PROMO_A))).toThrow(
      /retirerait la promotion/,
    );
  });

  it("une remise qui a disparu (ses articles retirés) n'est plus jugée", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: ONLY_SITE_A }]);

    expect(Order.revise(order, input("site_b", NONE)).changes).toContain("pickup_point");
  });

  it("défense : refuse une promotion que la commande n'avait pas", () => {
    expect(() => Order.revise(placed(NONE), input("site_b", PROMO_A))).toThrow(
      /ferait bénéficier la commande d'une promotion/,
    );
  });
});

/**
 * La ZONE entre dans le fait d'acheminement (`promotions.md`, § 2.14) : une
 * autre adresse peut tomber dans une autre zone.
 */
describe("Order.revise — l'adresse livrée, jugée sur les zones figées", () => {
  const ELSEWHERE: DraftOrderInput["fulfillment"] = {
    ...DELIVERY,
    deliveryZoneId: "zone_2",
    deliveryAddress: { ...POINT, ligne1: "1 route du Sommet", codePostal: "73320" },
  };

  it("refuse l'adresse d'une zone que la cible figée ne nomme pas", () => {
    const order = withActive(
      PROMO_A,
      [{ promotionId: "promo_a", terms: terms("none", { zones: ["zone_1"] }) }],
      DELIVERY,
    );

    expect(() => Order.revise(order, input("site_a", PROMO_A, ELSEWHERE))).toThrow(
      FulfillmentChangeAltersPromotionError,
    );
  });

  it("accepte l'adresse d'une zone nommée par la cible figée", () => {
    const order = withActive(
      PROMO_A,
      [{ promotionId: "promo_a", terms: terms("none", { zones: ["zone_1", "zone_2"] }) }],
      DELIVERY,
    );
    const revision = Order.revise(order, input("site_a", PROMO_A, ELSEWHERE));

    expect(revision.changes).toContain("delivery_address");
  });
});

/**
 * M7 : l'« après » d'une commande à plusieurs remises est la LISTE de
 * l'agrégat. 10 % puis 5 % du reste sur 20,00 € HT = 2,00 € + 0,90 €.
 */
describe("Order.revise — plusieurs remises cumulées, chacune jugée sur sa cible (M7)", () => {
  const FIVE_PERCENT: CartAdjustment = { mode: "percent", bp: 500 };
  const CUMULATED = [
    {
      promotionId: "promo_a",
      adjustment: TEN_PERCENT,
      label: null,
      coveredLines: [0],
      terms: ALL_POINTS_AND_ZONES,
    },
    {
      promotionId: "promo_b",
      adjustment: FIVE_PERCENT,
      label: null,
      coveredLines: [0],
      terms: ONLY_SITE_A,
    },
  ];

  function cumulatedInput(siteId: string): DraftOrderInput {
    return { ...input(siteId, NONE), basketDiscounts: CUMULATED, discountCents: 290 };
  }

  it("accepte un changement qui ne touche pas l'acheminement", () => {
    const order = withActive(NONE, [
      { promotionId: "promo_a", terms: ALL_POINTS_AND_ZONES },
      { promotionId: "promo_b", terms: ONLY_SITE_A },
    ]);
    const revision = Order.revise(order, { ...cumulatedInput("site_a"), note: "Porte B" });

    expect(revision.state.basketDiscounts.map((discount) => discount.promotionId)).toEqual([
      "promo_a",
      "promo_b",
    ]);
  });

  it("refuse un point que la cible de l'une des deux ne nomme pas", () => {
    const order = withActive(NONE, [
      { promotionId: "promo_a", terms: ALL_POINTS_AND_ZONES },
      { promotionId: "promo_b", terms: ONLY_SITE_A, label: "Cumul" },
    ]);

    expect(() => Order.revise(order, cumulatedInput("site_b"))).toThrow(
      "retirerait la promotion « Cumul »",
    );
  });
});
