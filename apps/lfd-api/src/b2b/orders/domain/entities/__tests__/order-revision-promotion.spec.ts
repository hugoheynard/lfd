import { discountCentsOf, type BillingAddressPayload, type CartAdjustment } from "@lfd/contracts";
import { millicentsFromCents } from "@lfd/money";

import { FulfillmentChangeAltersPromotionError } from "../../errors/fulfillment-promotion-errors.js";
import { Order, type DraftOrderInput } from "../order.js";
import type { RevisableOrder } from "../order-revision.js";
import type { FrozenBasketPromotion } from "../../services/frozen-basket-discounts.js";

/**
 * **L9 — changer d'acheminement ne change pas la promotion** (`documentation/promotions/promotions.md`, § 2.6). Changement de comportement assumé : jusqu'à L9, la révision
 * recalculait la remise au changement de point, en silence.
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
const FIFTEEN_PERCENT: CartAdjustment = { mode: "percent", bp: 1_500 };
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

describe("Order.revise — un changement de point ne change pas la promotion (L9)", () => {
  it("fige l'identifiant de la promotion panier sur la commande", () => {
    const order = Order.draft(input("site_a", PROMO_A));
    order.deferPayment();

    expect(order.toPersistence().discountPromotionId).toBe("promo_a");
  });

  it("refuse le point qui retirerait la promotion, en nommant le geste de sortie", () => {
    const attempt = () => Order.revise(placed(PROMO_A), input("site_b", NONE));

    expect(attempt).toThrow(FulfillmentChangeAltersPromotionError);
    expect(attempt).toThrow(/retirerait la promotion.*annulez la commande et repassez-la/);
  });

  it("refuse le point qui ajouterait une promotion", () => {
    expect(() => Order.revise(placed(NONE), input("site_b", PROMO_A))).toThrow(
      /ferait bénéficier la commande d'une promotion/,
    );
  });

  it("refuse le point qui remplacerait une promotion par une autre, même de même effet", () => {
    const other: Discount = { adjustment: TEN_PERCENT, promotionId: "promo_b" };

    expect(() => Order.revise(placed(PROMO_A), input("site_b", other))).toThrow(
      FulfillmentChangeAltersPromotionError,
    );
  });

  it("accepte un changement de point sans promotion ni avant ni après", () => {
    expect(Order.revise(placed(NONE), input("site_b", NONE)).changes).toContain("pickup_point");
  });

  it("accepte un changement de point qui garde la même promotion", () => {
    const revision = Order.revise(placed(PROMO_A), input("site_b", PROMO_A));

    expect(revision.state.discountPromotionId).toBe("promo_a");
  });

  it("ne juge pas une révision qui garde l'acheminement", () => {
    const kept = { ...input("site_a", NONE), note: "Sonner deux fois" };

    expect(Order.revise(placed(PROMO_A), kept).changes).toEqual(["note"]);
  });

  describe("une commande d'avant L9 (identifiant inconnu)", () => {
    it("accepte un point dont la remise a le même effet", () => {
      const revision = Order.revise(placed(PROMO_A, null), input("site_b", PROMO_A));

      expect(revision.state.discountPromotionId).toBe("promo_a");
    });

    it("refuse un point dont la remise a un autre effet", () => {
      const other: Discount = { adjustment: FIFTEEN_PERCENT, promotionId: "promo_b" };

      expect(() => Order.revise(placed(PROMO_A, null), input("site_b", other))).toThrow(
        /remplacerait la promotion/,
      );
    });

    it("refuse un point qui retirerait sa remise", () => {
      expect(() => Order.revise(placed(PROMO_A, null), input("site_b", NONE))).toThrow(
        /retirerait la promotion/,
      );
    });
  });
});

describe("Order.revise — le MODE d'acheminement ne change pas la promotion non plus (L9)", () => {
  // Du retrait à la livraison : `method` change, `pickup_point` aussi. La
  // promotion « en retrait » ne suit pas, et la commande ne perd pas sa remise
  // en silence.
  it("refuse le passage à la livraison qui retirerait la promotion", () => {
    expect(() => Order.revise(placed(PROMO_A), input("site_a", NONE, DELIVERY))).toThrow(
      /retirerait la promotion/,
    );
  });

  it("accepte le passage à la livraison quand la même promotion s'y applique encore", () => {
    const revision = Order.revise(placed(PROMO_A), input("site_a", PROMO_A, DELIVERY));

    expect(revision.changes).toContain("method");
    expect(revision.state.discountPromotionId).toBe("promo_a");
  });

  it("accepte le passage à la livraison d'une commande sans promotion, avant comme après", () => {
    expect(Order.revise(placed(NONE), input("site_a", NONE, DELIVERY)).changes).toContain("method");
  });
});

/**
 * `documentation/promotions/promotions.md`, § 2.14 : la
 * ZONE entre dans le fait d'acheminement. Une autre adresse peut tomber dans
 * une autre zone — l'adresse livrée est donc un changement d'acheminement.
 */
describe("Order.revise — l'adresse livrée ne change pas la promotion non plus", () => {
  const ELSEWHERE: DraftOrderInput["fulfillment"] = {
    ...DELIVERY,
    deliveryZoneId: "zone_2",
    deliveryAddress: { ...POINT, ligne1: "1 route du Sommet", codePostal: "73320" },
  };

  it("refuse l'adresse d'une autre zone qui retirerait la promotion de la zone", () => {
    const attempt = () =>
      Order.revise(placed(PROMO_A, "promo_a", DELIVERY), input("site_a", NONE, ELSEWHERE));

    expect(attempt).toThrow(FulfillmentChangeAltersPromotionError);
    expect(attempt).toThrow(/retirerait la promotion/);
  });

  it("accepte l'adresse d'une autre zone quand la même promotion s'y applique", () => {
    const revision = Order.revise(
      placed(PROMO_A, "promo_a", DELIVERY),
      input("site_a", PROMO_A, ELSEWHERE),
    );

    expect(revision.changes).toContain("delivery_address");
    expect(revision.state.discountPromotionId).toBe("promo_a");
  });
});

describe("Order.revise — une commande d'avant L9, jugée sur sa remise figée", () => {
  const FIVE_EUROS: CartAdjustment = { mode: "amount", cents: 500 };
  const SIX_EUROS: CartAdjustment = { mode: "amount", cents: 600 };
  const AMOUNT: Discount = { adjustment: FIVE_EUROS, promotionId: "promo_amount" };

  it("accepte un montant fixe identique", () => {
    const revision = Order.revise(placed(AMOUNT, null), input("site_b", AMOUNT));

    expect(revision.state.discountAdjustment).toEqual(FIVE_EUROS);
  });

  it("refuse un montant fixe différent", () => {
    const other: Discount = { adjustment: SIX_EUROS, promotionId: "promo_other" };

    expect(() => Order.revise(placed(AMOUNT, null), input("site_b", other))).toThrow(
      FulfillmentChangeAltersPromotionError,
    );
  });

  // 10 % et 10 € ne sont pas le même effet : le nombre peut coïncider (1 000
  // points de base, 1 000 centimes), le mode non.
  it("refuse un pourcentage là où le figé était un montant, même nombre", () => {
    const figé: Discount = { adjustment: { mode: "amount", cents: 1_000 }, promotionId: "p" };
    const percent: Discount = { adjustment: { mode: "percent", bp: 1_000 }, promotionId: "p" };

    expect(() => Order.revise(placed(figé, null), input("site_b", percent))).toThrow(
      /remplacerait la promotion/,
    );
  });

  it("ne juge pas un changement qui ne touche ni le mode ni le point", () => {
    const sameSiteNewNote = { ...input("site_a", NONE), note: "Au fond de la cour" };

    expect(Order.revise(placed(PROMO_A, null), sameSiteNewNote).changes).toEqual(["note"]);
  });

  // Une commande d'après L9 dont l'identifiant est connu est jugée sur
  // l'identifiant, JAMAIS sur l'effet : deux promotions de même effet diffèrent.
  it("une commande à identifiant connu n'est pas jugée sur l'effet", () => {
    const twin: Discount = { adjustment: FIVE_EUROS, promotionId: "promo_twin" };

    expect(() => Order.revise(placed(AMOUNT), input("site_b", twin))).toThrow(
      /remplacerait la promotion/,
    );
  });
});

describe("Order.revise — l'« avant » se lit dans order_discounts quand la commande y a des lignes (M3)", () => {
  const label = "Remise du Labo";

  /** La commande, ses colonnes figées ET ses remises actives relues en table. */
  function withActive(
    discount: Discount,
    active: readonly FrozenBasketPromotion[],
  ): RevisableOrder {
    return {
      ...placed(discount),
      activeDiscounts: active.map((one, i) => ({
        ...one,
        orderDiscountId: `od_${i + 1}`,
        coveredSkus: null,
      })),
    };
  }

  /**
   * Régression : L9 ne lisait que les colonnes `discount_*`. La table fait foi
   * dès qu'elle a des lignes actives (§ 18.9) : ici les colonnes disent
   * `promo_a`, la table `promo_b`, et c'est `promo_b` que l'après doit garder.
   */
  it("compare à la table, pas aux colonnes, dès qu'elle a des lignes actives", () => {
    const table = withActive(PROMO_A, [{ promotionId: "promo_b", adjustment: TEN_PERCENT, label }]);
    const promoB: Discount = { adjustment: TEN_PERCENT, promotionId: "promo_b" };

    expect(Order.revise(table, input("site_b", promoB)).changes).toContain("pickup_point");
    expect(() => Order.revise(table, input("site_b", PROMO_A))).toThrow(
      FulfillmentChangeAltersPromotionError,
    );
  });

  it("nomme la promotion en cause par son libellé figé", () => {
    const table = withActive(PROMO_A, [{ promotionId: "promo_a", adjustment: TEN_PERCENT, label }]);

    expect(() => Order.revise(table, input("site_b", NONE))).toThrow(
      `retirerait la promotion « ${label} »`,
    );
  });

  it("refuse l'acheminement qui ne garderait qu'une remise sur deux", () => {
    const two = withActive(PROMO_A, [
      { promotionId: "promo_a", adjustment: TEN_PERCENT, label },
      { promotionId: "promo_c", adjustment: FIFTEEN_PERCENT, label: "Cumul" },
    ]);

    expect(() => Order.revise(two, input("site_b", PROMO_A))).toThrow(
      "retirerait la promotion « Cumul »",
    );
  });

  it("une remise reprise sans identifiant se juge sur son ajustement", () => {
    const frozen = withActive(PROMO_A, [
      { promotionId: null, adjustment: TEN_PERCENT, label: null },
    ]);
    const other: Discount = { adjustment: FIFTEEN_PERCENT, promotionId: "promo_b" };

    expect(Order.revise(frozen, input("site_b", PROMO_A)).changes).toContain("pickup_point");
    expect(() => Order.revise(frozen, input("site_b", other))).toThrow(/remplacerait la promotion/);
  });

  it("sans ligne active, les colonnes figées font foi (commande non reprise)", () => {
    expect(() => Order.revise(withActive(PROMO_A, []), input("site_b", NONE))).toThrow(
      /retirerait la promotion dont/,
    );
  });
});

/**
 * M7 (plan des promotions, § 18.5 et § 18.6) : l'« après » d'une commande à
 * plusieurs remises est la LISTE de l'agrégat, les colonnes uniques étant à
 * `NULL`. 10 % puis 5 % du reste sur 20,00 € HT = 2,00 € + 0,90 €.
 */
describe("Order.revise — plusieurs remises cumulées, comparées rang par rang (M7)", () => {
  const FIVE_PERCENT: CartAdjustment = { mode: "percent", bp: 500 };
  const CUMULATED = [
    { promotionId: "promo_a", adjustment: TEN_PERCENT, label: null, coveredLines: [0] },
    { promotionId: "promo_b", adjustment: FIVE_PERCENT, label: null, coveredLines: [0] },
  ];

  function cumulatedInput(
    siteId: string,
    discounts: DraftOrderInput["basketDiscounts"],
    cents: number,
  ): DraftOrderInput {
    return { ...input(siteId, NONE), basketDiscounts: discounts, discountCents: cents };
  }

  function placedCumulated(): RevisableOrder {
    return {
      ...placed(NONE),
      activeDiscounts: CUMULATED.map((discount, index) => ({
        orderDiscountId: `od_${index}`,
        promotionId: discount.promotionId,
        adjustment: discount.adjustment,
        label: null,
        coveredSkus: ["VIE-001"],
      })),
    };
  }

  it("accepte un point où les deux mêmes remises s'appliquent, dans le même ordre", () => {
    const revision = Order.revise(placedCumulated(), cumulatedInput("site_b", CUMULATED, 290));

    expect(revision.state.basketDiscounts.map((discount) => discount.promotionId)).toEqual([
      "promo_a",
      "promo_b",
    ]);
    expect(revision.state.discountPromotionId).toBeNull();
  });

  it("refuse un point qui retirerait l'une des deux, en nommant le geste", () => {
    const single = input("site_b", PROMO_A);

    expect(() => Order.revise(placedCumulated(), single)).toThrow(/retirerait la promotion/);
  });

  it("refuse un point qui inverserait leur ordre", () => {
    const swapped = [CUMULATED[1], CUMULATED[0]].filter((discount) => discount !== undefined);

    expect(() => Order.revise(placedCumulated(), cumulatedInput("site_b", swapped, 290))).toThrow(
      FulfillmentChangeAltersPromotionError,
    );
  });
});
