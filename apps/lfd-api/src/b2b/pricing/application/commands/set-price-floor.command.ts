import type { PriceFloorPolicy } from "../../domain/floor-policy.js";
import type { PriceScope } from "../../domain/price-rule.js";

export class SetPriceFloorCommand {
  constructor(
    readonly scope: PriceScope,
    readonly policy: PriceFloorPolicy,
    readonly staffUserId: string,
  ) {}
}
