import { millicentsFromCents } from "@lfd/money";

import { FulfillmentChangeAltersPromotionError } from "../../errors/fulfillment-promotion-errors.js";
import { MisplacedPickupDiscountError } from "../../errors/order-errors.js";
import {
  ensureFulfillmentKeepsPromotion,
  revisedFulfillmentOf,
} from "../../services/fulfillment-promotion.js";
import { Order, type DraftOrderInput } from "../order.js";
import {
  ALL_POINTS_AND_ZONES,
  DELIVERY,
  NONE,
  ONLY_SITE_A,
  POINT,
  PROMO_A,
  TEN_PERCENT,
  terms,
  identity,
  input,
  placed,
  revisedInput,
  withActive,
} from "./order-revision-promotion.fixture.js";

/**
 * **L9 — changer d'acheminement ne change pas la promotion** (`documentation/promotions/promotions.md`, § 2.6),
 * jugé depuis le plan des remises acquises (§ 10.2) contre la **cible figée**
 * de chaque remise : la révision rejoue les remises, elle ne les rejuge plus,
 * et la comparaison rang par rang du lot M3 n'a plus d'objet.
 *
 * Jour de service absolu, jamais comparé à une horloge (exception étroite du
 * CLAUDE.md §5).
 */

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
    const attempt = () => Order.revise(order, revisedInput(order, "site_b"));

    expect(attempt).toThrow(FulfillmentChangeAltersPromotionError);
    expect(attempt).toThrow(
      /retirerait la promotion « Remise du Labo ».*annulez la commande et repassez-la/,
    );
  });

  it("accepte un autre point quand la cible figée vise tous les points", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: ALL_POINTS_AND_ZONES }]);
    const revision = Order.revise(order, revisedInput(order, "site_b"));

    expect(revision.changes).toContain("pickup_point");
    expect(revision.state.discountPromotionId).toBe("promo_a");
  });

  it("refuse le passage à la livraison quand la cible ne livre pas", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: ONLY_SITE_A }]);

    expect(() => Order.revise(order, revisedInput(order, "site_a", DELIVERY))).toThrow(
      /retirerait la promotion/,
    );
  });

  it("accepte le passage à la livraison quand la cible livre partout", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: ALL_POINTS_AND_ZONES }]);
    const revision = Order.revise(order, revisedInput(order, "site_a", DELIVERY));

    expect(revision.changes).toContain("method");
    expect(revision.state.discountPromotionId).toBe("promo_a");
  });

  it("accepte un changement de point sans promotion ni avant ni après", () => {
    const order = placed(NONE);
    expect(Order.revise(order, revisedInput(order, "site_b")).changes).toContain("pickup_point");
  });

  it("ne juge pas une révision qui garde l'acheminement, même sans termes figés", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: null }]);
    const kept = { ...revisedInput(order, "site_a"), note: "Sonner deux fois" };

    expect(Order.revise(order, kept).changes).toEqual(["note"]);
  });

  it("refuse un changement d'acheminement quand la cible n'est pas figée (remise pas encore reprise)", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: null }]);

    expect(() => Order.revise(order, revisedInput(order, "site_b"))).toThrow(
      /retirerait la promotion/,
    );
  });

  it("refuse aussi une commande sans ligne en table : les colonnes ne disent pas la cible", () => {
    const order = placed(PROMO_A);
    expect(() => Order.revise(order, revisedInput(order, "site_b"))).toThrow(
      /retirerait la promotion/,
    );
  });

  it("une remise qui a disparu (ses articles retirés) n'est plus jugée", () => {
    const order = withActive(PROMO_A, [{ promotionId: "promo_a", terms: ONLY_SITE_A }]);
    const bread = {
      sku: "PAI-001",
      productName: "Pain",
      unitPriceMillicents: millicentsFromCents(300),
      vatRate: 5.5,
      saleUnit: "piece" as const,
      quantity: 1,
    };
    const revision = Order.revise(order, revisedInput(order, "site_b", undefined, [bread]));

    expect(revision.changes).toContain("pickup_point");
    expect(revision.state.discountPromotionId).toBeNull();
  });

  /**
   * Défense en profondeur : le rejeu n'ajoute jamais de promotion, aucune
   * révision ne la produit depuis L7 (2a). La garde, en direct.
   */
  it("défense : refuse une promotion que la commande n'avait pas", () => {
    const after = revisedFulfillmentOf({
      ...identity("site_b"),
      lines: [],
      discountCents: 200,
      discountAdjustment: TEN_PERCENT,
      discountPromotionId: "promo_a",
      deliveryFeeCents: 0,
      deliveryFeeAdjustment: null,
      lateFeeCents: 0,
      lateFeeAdjustment: null,
      deliveryVatMode: "standard",
    });

    expect(() => ensureFulfillmentKeepsPromotion(placed(NONE), after)).toThrow(
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

    expect(() => Order.revise(order, revisedInput(order, "site_a", ELSEWHERE))).toThrow(
      FulfillmentChangeAltersPromotionError,
    );
  });

  it("accepte l'adresse d'une zone nommée par la cible figée", () => {
    const order = withActive(
      PROMO_A,
      [{ promotionId: "promo_a", terms: terms("none", { zones: ["zone_1", "zone_2"] }) }],
      DELIVERY,
    );
    const revision = Order.revise(order, revisedInput(order, "site_a", ELSEWHERE));

    expect(revision.changes).toContain("delivery_address");
  });
});

/**
 * M7 : l'« après » d'une commande à plusieurs remises est la LISTE de
 * l'agrégat. 10 % puis 5 % du reste sur 20,00 € HT = 2,00 € + 0,90 €.
 */
describe("Order.revise — plusieurs remises cumulées, chacune jugée sur sa cible (M7)", () => {
  it("accepte un changement qui ne touche pas l'acheminement", () => {
    const order = withActive(NONE, [
      { promotionId: "promo_a", terms: ALL_POINTS_AND_ZONES },
      { promotionId: "promo_b", terms: ONLY_SITE_A },
    ]);
    const revision = Order.revise(order, { ...revisedInput(order, "site_a"), note: "Porte B" });

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

    expect(() => Order.revise(order, revisedInput(order, "site_b"))).toThrow(
      "retirerait la promotion « Cumul »",
    );
  });
});

/**
 * **La remise d'un site, d'avant les promotions** (sans `discountPromotionId`) :
 * la seule remise qu'une révision puisse rejouer sans promotion. Changer
 * d'acheminement est refusé par L9 avant toute garde de montant (sa cible
 * n'est pas figée) ; la garde V5 reste atteignable sur une commande LIVRÉE
 * qui la porterait déjà — une donnée d'avant la garde, relue en base.
 */
describe("Order.revise — une remise de site d'avant les promotions", () => {
  it("refuse de l'emporter vers la livraison : L9, avant le montant", () => {
    const order = placed(PROMO_A, null);

    expect(() => Order.revise(order, revisedInput(order, "site_a", DELIVERY))).toThrow(
      FulfillmentChangeAltersPromotionError,
    );
  });

  it("refuse de la rejouer sur une commande livrée : la remise de retrait n'existe qu'au retrait", () => {
    const order = {
      ...placed(NONE, null, DELIVERY),
      discountAdjustment: TEN_PERCENT,
      discountCents: 200,
    };

    expect(() =>
      Order.revise(order, { ...revisedInput(order, "site_a", DELIVERY), note: "Porte B" }),
    ).toThrow(new MisplacedPickupDiscountError("not_picked_up"));
  });
});
