import { weeklyMomentOf } from "@lfd/contracts";

import type { AdmittedPromotion } from "../../../promotions/domain/live-promotion.js";
import { weeklyHoursOf } from "../../../promotions/domain/promotion-condition.js";
import type { ServedPromotionLabel } from "../../../promotions/domain/promotion-labels.js";
import {
  weeklyHoursCover,
  weeklyHoursEndedAt,
} from "../../../promotions/domain/promotion-weekly-hours.js";
import type { OrderLineClassification } from "../ports/order-line-classification.reader.js";
import { chooseBasketPromotion, type BasketLine } from "./basket-promotion-choice.js";

/** Une remise à heures qui a pris fin aujourd'hui, et l'heure de sa fin (`HH:MM`). */
export interface EndedBasketPromotion {
  readonly promotionId: string;
  readonly label: ServedPromotionLabel;
  readonly endedAt: string;
}

/**
 * **Les remises à heures qui ont pris fin aujourd'hui et auraient touché ce
 * panier** (`documentation/promotions/plan-jours-et-heures.md`, § 8,
 * « Caches ») — pur. Un panier affiché à 18 h 59 et relu à 19 h dit « La
 * remise « X » a pris fin à 19 h » plutôt qu'un total qui change sans
 * explication.
 *
 * `admittedAtAnyHour` : les promotions admises pour cet acheteur et cet
 * acheminement, jours et heures NON jugés. Ne sont retenues que celles
 * jugées à la commande, hors de leurs heures maintenant, dont une plage du
 * jour est finie ; puis celles que la caisse appliquerait à ce panier
 * (portée, seuil) si elles valaient encore.
 */
export function endedBasketPromotions(
  admittedAtAnyHour: readonly AdmittedPromotion[],
  at: Date,
  lines: readonly BasketLine[],
  known: ReadonlyMap<string, OrderLineClassification>,
): EndedBasketPromotion[] {
  const now = weeklyMomentOf(at);
  const endedAt = new Map<string, string>();
  for (const promotion of admittedAtAnyHour) {
    const hours = weeklyHoursOf(promotion.conditions);
    const end = hours === null ? null : weeklyHoursEndedAt(hours, at);
    if (hours !== null && end !== null && !weeklyHoursCover(hours, now)) {
      endedAt.set(promotion.id, end);
    }
  }
  if (endedAt.size === 0) {
    return [];
  }
  const ended = admittedAtAnyHour.filter((promotion) => endedAt.has(promotion.id));
  return chooseBasketPromotion(ended, lines, known).applied.map((applied) => ({
    promotionId: applied.promotionId,
    label: applied.label,
    endedAt: endedAt.get(applied.promotionId) ?? "",
  }));
}
