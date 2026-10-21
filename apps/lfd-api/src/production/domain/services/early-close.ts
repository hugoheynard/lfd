import { instantToLocal } from "@lfd/contracts";

import { PlanClosedBeforeOrderCutoffError } from "../errors/production-errors.js";
import { closeDue, frenchDayLabel } from "./auto-close-round.js";

/**
 * **Pas d'arrêt avant l'heure limite** (Hugo, 2026-10-21 —
 * `limites-de-commande/plan-une-seule-heure.md` §4 Q1, §5).
 *
 * Le plan d'une journée s'arrête tout seul à `closesAt` (`planClosesAt`) ; un
 * arrêt demandé plus tôt est refusé, quel qu'en soit l'auteur. Le même seuil
 * que le tour (`closeDue`) : l'arrêt automatique passe toujours. Sans heure
 * limite posée (`null`), rien ne l'arrête seul, et l'arrêt reste ouvert.
 *
 * @throws {PlanClosedBeforeOrderCutoffError} `now` précède `closesAt`.
 */
export function refuseCloseBeforeCutoff(day: string, closesAt: Date | null, now: Date): void {
  if (closesAt === null || closeDue(closesAt, now)) {
    return;
  }
  const local = instantToLocal(closesAt);
  throw new PlanClosedBeforeOrderCutoffError(
    frenchDayLabel(day),
    `${frenchDayLabel(local.day)} à ${local.time}`,
  );
}
