import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Arrêter un plan sans personne** — la VRAIE clôture, balayage des
 * règlements compris, sous l'acteur système `auto-close` (plan
 * `arret-du-plan.md`, §3, S7, lot A2).
 *
 * Un port plutôt que le bus en direct : le tour ne connaît que l'intention,
 * et ses tests la doublent sans démarrer Nest.
 *
 * @throws {ProductionDayEmptyError} la journée ne porte aucune commande.
 */
export abstract class AutomaticDayCloser {
  abstract close(day: ServiceDay): Promise<void>;
}
