import type { ArrestedPlanHold } from "../../production/channels/packing/index.js";
import { PackingPlanReopenedError } from "../domain/errors/packing-plan-errors.js";

/**
 * Tient le plan de la journée jusqu'au `COMMIT` du geste, et refuse s'il a été
 * ROUVERT (audit du réassort, 2026-11-02 — `fournil/arret-du-plan.md`, « Rouvrir
 * une journée arrêtée »). Une journée JAMAIS arrêtée passe : aucune feuille
 * n'existe encore, et c'est le geste qui le dit lui-même (« pas encore arrivé
 * au poste de colisage ») — la garde dirait « rouvert », ce qui serait faux
 * (régression vue sur `test/production-batch.e2e-spec.ts`, 2026-11-03).
 *
 * 🔴 PREMIER appel de l'unité de travail, avant tout verrou de ligne et toute
 * écriture : la réouverture prend le même verrou en exclusif, puis lit si le
 * colisage a commencé. Un geste qui l'a tenu avant elle est vu ; un geste qui
 * arrive après lit le plan rouvert et ne s'appuie sur rien.
 *
 * @throws {PackingPlanReopenedError} le plan a été rouvert.
 */
export async function holdArrestedPlan(hold: ArrestedPlanHold, serviceDay: string): Promise<void> {
  if ((await hold.hold(serviceDay)) === "reopened") {
    throw new PackingPlanReopenedError(serviceDay);
  }
}
