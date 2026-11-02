import type { ArrestedPlanHold } from "../../production/channels/delivery/index.js";
import { DeliveryPlanReopenedError } from "../domain/errors/delivery-plan-errors.js";

/**
 * Tient le plan de la journée jusqu'au `COMMIT` du geste, et refuse s'il a été
 * rouvert (audit du réassort, 2026-11-02 — `fournil/arret-du-plan.md`).
 *
 * Seul `reopened` refuse : charger ou faire partir une tournée d'une journée
 * jamais arrêtée reste permis, comme avant (décision du 2026-11-02).
 *
 * 🔴 Après la lecture qui donne la journée, AVANT toute écriture. Les lignes
 * déjà verrouillées (bac, tournée, chargements) n'inter-bloquent pas : la
 * réouverture, qui tient le verrou exclusif, ne verrouille aucune ligne de la
 * livraison (vérifié le 2026-11-02 dans `reopen-production-day.handler.ts`).
 *
 * @throws {DeliveryPlanReopenedError} le plan a été rouvert.
 */
export async function refuseReopenedPlan(
  plan: ArrestedPlanHold,
  serviceDay: string,
): Promise<void> {
  if ((await plan.hold(serviceDay)) === "reopened") {
    throw new DeliveryPlanReopenedError(serviceDay);
  }
}
