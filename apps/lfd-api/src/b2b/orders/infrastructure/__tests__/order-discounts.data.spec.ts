import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import type { AppliedBasketDiscount } from "../../domain/entities/order-basket-discounts.js";
import { orderDiscountsWriteOf } from "../order-discounts.data.js";

/**
 * **L'écriture des remises de panier** (plan des promotions, § 18.2, M3) :
 * une remise = une ligne `computed`, ses couvertures pointent les lignes que
 * la même écriture vient d'identifier.
 */

const DISCOUNT: AppliedBasketDiscount = {
  rank: 1,
  promotionId: "promo_1",
  adjustment: { mode: "percent", bp: 1_000 },
  label: { fr: "Remise retrait", en: "Pickup", it: "Ritiro" },
  baseCents: 1_882,
  amountCents: 188,
  amountTtcCents: null,
  vatShares: [
    { rate: 5.5, htCents: 93 },
    { rate: 20, htCents: 95 },
  ],
  coveredLines: [0, 2],
  terms: null,
};

describe("orderDiscountsWriteOf", () => {
  it("écrit une ligne computed par remise, et la couverture des lignes désignées", () => {
    const ids = new FixedIdGenerator("disc");

    const write = orderDiscountsWriteOf([DISCOUNT], ["line_a", "line_b", "line_c"], () =>
      ids.next(),
    );

    expect(write.create).toEqual([
      {
        id: "disc_000001",
        origin: "computed",
        rank: 1,
        promotionId: "promo_1",
        adjustment: { mode: "percent", bp: 1_000 },
        label: { fr: "Remise retrait", en: "Pickup", it: "Ritiro" },
        baseCents: 1_882,
        amountCents: 188,
        amountTtcCents: null,
        vatShares: [
          { rate: 5.5, htCents: 93 },
          { rate: 20, htCents: 95 },
        ],
        // Termes inconnus : toutes les colonnes à NULL ensemble (CHECK).
        cumulative: null,
        minQuantity: null,
        fulfillmentPickup: null,
        fulfillmentDelivery: null,
        fulfillmentPickupPoints: [],
        fulfillmentDeliveryZones: [],
        frozenTermsOrigin: null,
      },
    ]);
    expect(write.coverage).toEqual([
      { orderLineId: "line_a", orderDiscountId: "disc_000001" },
      { orderLineId: "line_c", orderDiscountId: "disc_000001" },
    ]);
  });

  it("n'écrit pas de libellé quand la remise n'en a pas (NULL en base)", () => {
    const write = orderDiscountsWriteOf([{ ...DISCOUNT, label: null }], ["a", "b", "c"], () => "d");

    expect(write.create[0]).not.toHaveProperty("label");
  });

  it("aucune remise : rien à écrire", () => {
    expect(orderDiscountsWriteOf([], ["a"], () => "d")).toEqual({ create: [], coverage: [] });
  });

  it("refuse une couverture hors des lignes de la commande", () => {
    expect(() => orderDiscountsWriteOf([DISCOUNT], ["line_a"], () => "d")).toThrow(
      /couvre la ligne n° 3/,
    );
  });
});
