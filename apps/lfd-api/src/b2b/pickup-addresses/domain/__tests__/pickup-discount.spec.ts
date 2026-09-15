import { PickupDiscount } from "../pickup-discount.js";
import { PickupDiscountWithoutAudienceError } from "../pickup-errors.js";

/**
 * La seule règle de la remise d'un point : une réduction qui ne vise personne
 * est refusée. Plan `remise-et-livraison-par-clientele`, D2.
 */
describe("PickupDiscount", () => {
  it("accepte une réduction réservée aux pros", () => {
    const discount = PickupDiscount.of({ mode: "percent", bp: 1_000 }, { b2b: true, b2c: false });

    expect(discount.adjustment).toEqual({ mode: "percent", bp: 1_000 });
    expect(discount.audiences).toEqual({ b2b: true, b2c: false });
  });

  it("refuse une réduction qui ne vise aucune clientèle, en nommant le geste de sortie", () => {
    const attempt = (): PickupDiscount =>
      PickupDiscount.of({ mode: "amount", cents: 500 }, { b2b: false, b2c: false });

    expect(attempt).toThrow(PickupDiscountWithoutAudienceError);
    expect(attempt).toThrow("Cochez au moins une clientèle, ou retirez la réduction.");
  });

  /**
   * Sans réduction, les cases ne sont pas lues : un point dont on a retiré la
   * remise après l'avoir fermée à tous garde ses cases telles quelles.
   */
  it("sans réduction, conserve les cases décochées au lieu de les refuser", () => {
    const discount = PickupDiscount.of(null, { b2b: false, b2c: false });

    expect(discount.adjustment).toBeNull();
    expect(discount.audiences).toEqual({ b2b: false, b2c: false });
  });

  it("ne partage pas l'objet reçu : muter la charge après coup ne change pas la remise", () => {
    const audiences = { b2b: true, b2c: true };
    const discount = PickupDiscount.of({ mode: "percent", bp: 500 }, audiences);

    audiences.b2c = false;

    expect(discount.audiences).toEqual({ b2b: true, b2c: true });
  });
});
