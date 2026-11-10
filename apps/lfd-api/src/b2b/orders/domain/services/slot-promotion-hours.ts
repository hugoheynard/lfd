import { weeklyMomentOfLocal } from "@lfd/contracts";

import {
  schedulePhrase,
  weeklyHoursCover,
} from "../../../promotions/domain/promotion-weekly-hours.js";
import type { RevisableOrder } from "../../revision/domain/entities/order-revision.js";
import { SlotOutsidePromotionHoursError } from "../errors/fulfillment-promotion-errors.js";
import { replayableDiscountsOf } from "./basket-discount-replay.js";
import { stillApplied, type RevisedFulfillment } from "./fulfillment-promotion.js";
import { handoverMomentOf } from "./handover-moment.js";

/**
 * **L9, le créneau** (`documentation/promotions/plan-jours-et-heures.md`,
 * § 8.2 et § 11) — une remise acquise pour une promotion jugée « au retrait »
 * (`handover_at`) l'a été pour le créneau choisi. Changer le jour ou la
 * tranche se juge contre les heures FIGÉES de la remise : dans les heures, la
 * remise suit ; hors des heures (ou sans créneau), refus nommé — jamais une
 * remise gardée pour un créneau qu'elle ne couvre pas, ni retirée en silence.
 *
 * Une promotion jugée à la commande (`ordered_at`) garde sa remise : la
 * commande a été passée dans la plage (§ 6 Q3). Une remise sans heures
 * figées (termes inconnus, ou promotion sans heures) n'a rien à juger ici.
 *
 * @throws {SlotOutsidePromotionHoursError}
 */
export function ensureSlotKeepsPromotionHours(
  order: RevisableOrder,
  after: RevisedFulfillment,
): void {
  const before = handoverMomentOf(order.serviceDay, order.agreed.window.value);
  const moment = handoverMomentOf(after.serviceDay, after.window);
  if (before?.day === moment?.day && before?.time === moment?.time) {
    return;
  }
  for (const discount of replayableDiscountsOf(order)) {
    const hours = discount.terms?.hours ?? null;
    if (
      hours === null ||
      hours.moment !== "handover_at" ||
      !stillApplied(discount, after.promotions)
    ) {
      continue;
    }
    if (moment === null || !weeklyHoursCover(hours, weeklyMomentOfLocal(moment))) {
      throw new SlotOutsidePromotionHoursError(
        order.orderId,
        discount.label,
        schedulePhrase(hours),
      );
    }
  }
}
