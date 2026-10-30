import type { PromotionTerms } from "../../domain/promotion-terms.js";

/**
 * **Poser une promotion** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * lot L3). Aucun écran ne l'envoie encore : l'éditeur, le refus de
 * chevauchement et le verrou « avant la bascule » sont le lot L7.
 */
export class PosePromotionCommand {
  constructor(
    readonly terms: PromotionTerms,
    readonly staffUserId: string,
  ) {}
}
