import type { FloorClientele } from "../../domain/entities/pricing-floor.js";
import type { PriceScope } from "../../domain/price-rule.js";

/**
 * **Confirmer** une limite sans la changer.
 *
 * Un geste à part entière, et pas un `PUT` déguisé : il dit « j'ai regardé
 * l'écart, et je maintiens ». Sans lui, la seule façon d'éteindre le signal de
 * dérive serait de modifier la limite — donc de changer une décision pour faire
 * taire un rappel, ce qui est exactement l'inverse du but.
 */
export class ConfirmPriceFloorCommand {
  constructor(
    readonly scope: PriceScope,
    readonly clientele: FloorClientele,
    readonly staffUserId: string,
  ) {}
}
