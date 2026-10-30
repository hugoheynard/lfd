import type { LivePromotion } from "../live-promotion.js";

/**
 * **Les promotions du point PANIER** (avec un critère d'acheminement) — le
 * pendant de {@link LinePromotionReader} pour l'ajustement de panier, que
 * seul ce lecteur-là sert.
 */
export abstract class BasketPromotionReader {
  /** Les non archivées — le présent. */
  abstract live(): Promise<readonly LivePromotion[]>;

  /** Celles qui n'étaient pas encore archivées à `at` — la lecture datée. */
  abstract liveAt(at: Date): Promise<readonly LivePromotion[]>;
}
