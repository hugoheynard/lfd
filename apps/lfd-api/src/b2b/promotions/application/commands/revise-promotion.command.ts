import type { PromotionSurface } from "../../domain/promotion-surface.js";
import type { PromotionTerms } from "../../domain/promotion-terms.js";

/** **Réviser** les termes d'une promotion — même identité, acte `replaced`. */
export class RevisePromotionCommand {
  constructor(
    readonly id: string,
    readonly terms: PromotionTerms,
    readonly staffUserId: string,
    readonly reason: string | null,
    readonly surface: PromotionSurface,
  ) {}
}
