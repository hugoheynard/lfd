import type { LivePromotion } from "../live-promotion.js";

/**
 * **Les promotions du point LIGNE** (sans critère d'acheminement), telles que
 * la chaîne de prix les lit — un port de lecture, distinct du dépôt de
 * l'agrégat (ISP). Deux lectures, sur le patron des règles de prix
 * (`PriceRuleReader`) : le présent, et une date passée.
 */
export abstract class LinePromotionReader {
  /** Les non archivées — le présent. */
  abstract live(): Promise<readonly LivePromotion[]>;

  /**
   * Celles qui n'étaient pas encore archivées à `at` — la lecture datée
   * (§ 14 B1) : une promotion archivée hier agissait avant-hier.
   */
  abstract liveAt(at: Date): Promise<readonly LivePromotion[]>;
}
