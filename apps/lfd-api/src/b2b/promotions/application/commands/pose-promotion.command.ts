import type { PromotionTerms } from "../../domain/promotion-terms.js";

/**
 * **Poser une promotion** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * lots L3 et L7) — depuis l'écran Promotions, seul endroit où une promotion
 * se règle (`documentation/promotions/plan-un-seul-endroit.md`).
 */
export class PosePromotionCommand {
  constructor(
    readonly terms: PromotionTerms,
    readonly staffUserId: string,
  ) {}
}
