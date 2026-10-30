import type { Promotion } from "../promotion.js";

/**
 * **Les promotions, telles que l'écran les parcourt** — toutes, archivées
 * comprises. Port de LECTURE, distinct du dépôt (ISP) : une requête de
 * l'écran ne reçoit pas de quoi écrire.
 */
export abstract class PromotionBrowser {
  abstract all(): Promise<readonly Promotion[]>;

  abstract find(id: string): Promise<Promotion | null>;
}
