import { InvalidOrderLineError } from "../../errors/order-errors.js";
import { OrderLine } from "../order-line.js";

/**
 * `OrderLine.ofTtc` — la ligne d'une commande composée en TTC (`exact_ht`,
 * plan `documentation/pricing/plan-centime-particuliers.md`, § 4) : le HT est
 * reçu de la composition, et la ligne vérifie ce qu'elle peut vérifier seule.
 */
const BANANA = {
  sku: "BAN-001",
  productName: "Banana bread",
  unitPriceMillicents: 1_990_521,
  vatRate: 5.5,
  quantity: 2,
};

const COMPOSED = { vatRate: 5.5, labelCents: 2_100, ttcCents: 4_200, htCents: 3_981 };

describe("OrderLine.ofTtc", () => {
  it("scelle l'étiquette et quantité × étiquette, et garde le HT reçu", () => {
    const snapshot = OrderLine.ofTtc(BANANA, COMPOSED).toSnapshot();

    expect(snapshot).toMatchObject({
      lineTotalCents: 3_981,
      unitPriceTtcCents: 2_100,
      lineTotalTtcCents: 4_200,
      pickupDiscountEligible: true,
    });
  });

  it("refuse une étiquette qui n'est pas celle de la vignette", () => {
    expect(() =>
      OrderLine.ofTtc(BANANA, { ...COMPOSED, labelCents: 2_101, ttcCents: 4_202 }),
    ).toThrow(InvalidOrderLineError);
  });

  it("refuse un TTC qui n'est pas quantité × étiquette", () => {
    expect(() => OrderLine.ofTtc(BANANA, { ...COMPOSED, ttcCents: 4_201 })).toThrow(
      InvalidOrderLineError,
    );
  });

  it("refuse un HT négatif ou plus grand que le TTC", () => {
    expect(() => OrderLine.ofTtc(BANANA, { ...COMPOSED, htCents: -1 })).toThrow(
      InvalidOrderLineError,
    );
    expect(() => OrderLine.ofTtc(BANANA, { ...COMPOSED, htCents: 4_201 })).toThrow(
      InvalidOrderLineError,
    );
  });

  it("refuse une composition d'un autre taux", () => {
    expect(() => OrderLine.ofTtc(BANANA, { ...COMPOSED, vatRate: 20 })).toThrow(
      InvalidOrderLineError,
    );
  });

  it("garde les refus de quantité et de prix de `create`", () => {
    expect(() => OrderLine.ofTtc({ ...BANANA, quantity: 0 }, COMPOSED)).toThrow(
      InvalidOrderLineError,
    );
    expect(() => OrderLine.ofTtc({ ...BANANA, unitPriceMillicents: -1 }, COMPOSED)).toThrow(
      InvalidOrderLineError,
    );
  });
});
