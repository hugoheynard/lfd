import { instantToLocal } from "@lfd/contracts";

import { PlanClosedBeforeOrderCutoffError } from "../errors/production-errors.js";
import { closeDue, frenchDayLabel } from "./auto-close-round.js";
import type { PlanStop } from "./latest-order-cutoff.js";

/**
 * **Pas d'arrêt avant l'heure limite** (Hugo, 2026-10-21 —
 * `limites-de-commande/plan-une-seule-heure.md` §4 Q1, §5).
 *
 * Le plan d'une journée s'arrête tout seul à `closesAt` (`planClosesAt`) ; un
 * arrêt demandé plus tôt est refusé, quel qu'en soit l'auteur. Le même seuil
 * que le tour (`closeDue`) : l'arrêt automatique passe toujours. Sans heure
 * limite posée (`null`), rien ne l'arrête seul, et l'arrêt reste ouvert.
 *
 * Le refus nomme ce qui fixe l'arrêt — l'heure limite générale ou l'heure
 * du réassort (lot R3b, §13.4 point 3).
 *
 * @throws {PlanClosedBeforeOrderCutoffError} `now` précède l'arrêt.
 */
export function refuseCloseBeforeCutoff(day: string, stop: PlanStop | null, now: Date): void {
  if (stop === null || closeDue(stop.at, now)) {
    return;
  }
  const local = instantToLocal(stop.at);
  throw new PlanClosedBeforeOrderCutoffError(
    frenchDayLabel(day),
    `${frenchDayLabel(local.day)} à ${local.time}`,
    stop.cause,
  );
}
