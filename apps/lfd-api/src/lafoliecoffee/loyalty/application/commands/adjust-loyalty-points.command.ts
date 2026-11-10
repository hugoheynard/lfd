import type { LoyaltyHolderKind } from "../../domain/value-objects/loyalty-holder.js";

/** Un ajustement motivé du staff : des points en plus (positif) ou en moins (négatif). */
export class AdjustLoyaltyPointsCommand {
  constructor(
    readonly holderKind: LoyaltyHolderKind,
    readonly holderId: string,
    readonly points: number,
    readonly reason: string,
    readonly staffUserId: string,
  ) {}
}
