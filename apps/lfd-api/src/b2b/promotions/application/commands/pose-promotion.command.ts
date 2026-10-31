import type { PromotionTerms } from "../../domain/promotion-terms.js";

/**
 * **Poser une promotion** (`documentation/promotions/promotions.md`,
 * lots L3 et L7) — depuis l'écran Promotions, seul endroit où une promotion
 * se règle (`documentation/promotions/promotions.md`, § 2.15).
 */
export class PosePromotionCommand {
  constructor(
    readonly terms: PromotionTerms,
    readonly staffUserId: string,
  ) {}
}
