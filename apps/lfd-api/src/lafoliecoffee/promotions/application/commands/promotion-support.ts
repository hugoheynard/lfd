import { PromotionNotFoundError } from "../../domain/errors/promotion-errors.js";
import type { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import type { Promotion } from "../../domain/promotion.js";

/**
 * La promotion visée, sous le verrou de sa ligne, ou le refus 404 — pour un
 * geste qui décide sur son état puis l'écrit. À appeler dans `UnitOfWork.run`.
 *
 * @throws {PromotionNotFoundError} elle n'existe pas.
 */
export async function mustLoadLockedPromotion(
  promotions: PromotionRepository,
  id: string,
): Promise<Promotion> {
  const promotion = await promotions.loadLocked(id);
  if (promotion === null) {
    throw new PromotionNotFoundError(id);
  }
  return promotion;
}
