import type { PromotionApplicationPoint } from "../promotion-fulfillment.js";
import type { Promotion } from "../promotion.js";

/**
 * **Les promotions qui gardent leur place** — non archivées, actives ou en
 * pause (§ 13.2 : une pause garde sa place, comme une règle de prix). Lues à
 * la pose, à la révision et à la reprise pour refuser un chevauchement.
 * Port étroit (ISP) : ni le calcul ni l'écran n'en ont besoin.
 */
export abstract class PromotionRivalsReader {
  abstract unarchived(point: PromotionApplicationPoint): Promise<readonly Promotion[]>;
}
