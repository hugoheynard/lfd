import type { PromotionSurface } from "../../domain/promotion-surface.js";

/** **Archiver** une promotion — terminal, motif obligatoire. */
export class ArchivePromotionCommand {
  constructor(
    readonly id: string,
    readonly staffUserId: string,
    readonly reason: string,
    readonly surface: PromotionSurface,
  ) {}
}
