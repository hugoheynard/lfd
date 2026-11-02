import type { ArrestedPlanHold } from "../../production/channels/packing/index.js";
import { PackingPlanReopenedError } from "../domain/errors/packing-plan-errors.js";

/**
 * Tient le plan arrêté de la journée jusqu'au `COMMIT` du geste, et refuse s'il
 * n'est pas arrêté — rouvert, ou jamais arrêté (aucune feuille n'existe alors) (audit du réassort, 2026-11-02 —
 * `fournil/arret-du-plan.md`, « Rouvrir une journée arrêtée »).
 *
 * 🔴 PREMIER appel de l'unité de travail, avant tout verrou de ligne et toute
 * écriture : la réouverture prend le même verrou en exclusif, puis lit si le
 * colisage a commencé. Un geste qui l'a tenu avant elle est vu ; un geste qui
 * arrive après lit le plan rouvert et ne s'appuie sur rien.
 *
 * @throws {PackingPlanReopenedError} le plan n'est plus arrêté.
 */
export async function holdArrestedPlan(hold: ArrestedPlanHold, serviceDay: string): Promise<void> {
  if ((await hold.hold(serviceDay)) !== "arrested") {
    throw new PackingPlanReopenedError(serviceDay);
  }
}
