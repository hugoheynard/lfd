import type { PriceFloorPolicy } from "../../domain/floor-policy.js";
import type { FloorClientele } from "../../domain/entities/pricing-floor.js";
import type { PriceScope } from "../../domain/price-rule.js";

export class SetPriceFloorCommand {
  constructor(
    readonly scope: PriceScope,
    readonly clientele: FloorClientele,
    readonly policy: PriceFloorPolicy,
    readonly staffUserId: string,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}
