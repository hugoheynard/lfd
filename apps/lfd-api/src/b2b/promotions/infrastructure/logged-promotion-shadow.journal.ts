import { Injectable, Logger } from "@nestjs/common";

import {
  PromotionShadowJournal,
  type PromotionShadowDivergence,
} from "../domain/ports/promotion-shadow.journal.js";

/** Le nom du log, cherché tel quel dans les journaux de dev pendant l'ombre. */
export const SHADOW_DIVERGENCE_LOG = "promotions.shadow_divergence";

/**
 * **Le journal du mode ombre**, en log structuré nommé (§ 13.5). Un
 * avertissement et non une erreur : le prix servi est l'ancien, juste par
 * construction ; l'écart dit seulement que la bascule n'est pas prête.
 */
@Injectable()
export class LoggedPromotionShadowJournal extends PromotionShadowJournal {
  private readonly logger = new Logger("PromotionsShadow");

  divergence(entry: PromotionShadowDivergence): void {
    this.logger.warn({ message: SHADOW_DIVERGENCE_LOG, ...entry });
  }
}
