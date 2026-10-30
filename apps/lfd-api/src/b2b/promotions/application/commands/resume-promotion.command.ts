import type { PromotionSurface } from "../../domain/promotion-surface.js";

/** **Reprendre** une promotion suspendue. */
export class ResumePromotionCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string | null,
    readonly surface: PromotionSurface,
  ) {}
}
