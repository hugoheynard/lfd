import type { CartAdjustment, PickupDiscountAudiences } from "@lfd/contracts";

import { PickupDiscountWithoutAudienceError } from "./pickup-errors.js";

/**
 * **La remise d'un point de retrait, et à qui elle s'applique.**
 *
 * Un value object et pas un agrégat : une seule règle, sans transition
 * (`plan-remise-et-livraison-par-clientele.md`, D2). Mais cette règle-là peut
 * refuser une écriture, donc elle vit ICI — ni dans le contrôleur, qui ne
 * connaît que la forme, ni dans l'adaptateur. Le port d'écriture ne prend que
 * ce type : une remise sans clientèle y est inexprimable.
 *
 * **Sans réduction, les cases ne sont pas lues** : elles sont conservées telles
 * quelles. `{ b2b: false, b2c: false }` avec `adjustment: null` est valide — c'est
 * l'état d'un point dont on a retiré la remise après l'avoir fermée à tous, et
 * le lui refuser obligerait l'admin à recocher une case qui ne sert à rien.
 */
export class PickupDiscount {
  private constructor(
    readonly adjustment: CartAdjustment | null,
    readonly audiences: PickupDiscountAudiences,
  ) {}

  /**
   * @throws {PickupDiscountWithoutAudienceError} une réduction non nulle ne vise
   *   aucune clientèle.
   */
  static of(adjustment: CartAdjustment | null, audiences: PickupDiscountAudiences): PickupDiscount {
    if (adjustment !== null && !audiences.b2b && !audiences.b2c) {
      throw new PickupDiscountWithoutAudienceError();
    }
    return new PickupDiscount(adjustment, { b2b: audiences.b2b, b2c: audiences.b2c });
  }
}
