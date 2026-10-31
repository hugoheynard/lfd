import type { PromotionSurface } from "../../domain/promotion-surface.js";
import type { PromotionTerms } from "../../domain/promotion-terms.js";

/**
 * **Poser une promotion** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * lots L3 et L7) — depuis l'écran Promotions ou depuis un point de retrait
 * (`surface`), après la bascule seulement.
 */
export class PosePromotionCommand {
  constructor(
    readonly terms: PromotionTerms,
    readonly staffUserId: string,
    readonly surface: PromotionSurface,
  ) {}
}
