import { PromotionNotFoundError } from "../../domain/errors/promotion-errors.js";
import type { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import type { Promotion } from "../../domain/promotion.js";

/**
 * La promotion visée, ou le refus 404 — partagé par les quatre gestes sur une
 * promotion existante.
 *
 * @throws {PromotionNotFoundError} elle n'existe pas.
 */
export async function mustLoadPromotion(
  promotions: PromotionRepository,
  id: string,
): Promise<Promotion> {
  const promotion = await promotions.load(id);
  if (promotion === null) {
    throw new PromotionNotFoundError(id);
  }
  return promotion;
}
