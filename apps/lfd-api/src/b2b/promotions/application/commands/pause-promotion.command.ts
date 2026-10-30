import type { PromotionSurface } from "../../domain/promotion-surface.js";

/** **Suspendre** une promotion : elle cesse d'agir et garde sa place. */
export class PausePromotionCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string | null,
    readonly surface: PromotionSurface,
  ) {}
}
