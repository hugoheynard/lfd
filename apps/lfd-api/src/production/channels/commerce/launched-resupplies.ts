import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **« Ce réassort est-il lancé ? »** — port que le fournil DÉCLARE et
 * IMPLÉMENTE, et que le commerce appelle quand il annule un réassort « au
 * plus tôt » (R4a, `reassort-boutiques/plan-au-plus-tot.md` §2, BLOQUANT 3
 * de `vitruve`).
 *
 * ## Pourquoi synchrone, et sous le verrou
 *
 * Le lancement prend le verrou de la journée (`production_day:<jour>`), lit
 * le réassort au commerce, puis l'écrit au plan. Ce port prend le MÊME
 * verrou, puis lit le plan : l'annulation voit le lancement, ou le lancement
 * voit l'annulation — jamais aucun des deux. La colonne « lancé » du commerce
 * n'est qu'un affichage, posée APRÈS par le fait `production.resupply_launched` :
 * s'y fier laisserait annuler un réassort déjà compté dans les fournées.
 *
 * 🔴 **Dans l'unité de travail de l'appelant** (précédent :
 * `PlanAdmissionDesk`) : le verrou tient jusqu'à son `COMMIT`.
 *
 * `production → b2b` reste interdit : le fournil ne sait pas qui l'appelle.
 */
export abstract class LaunchedResupplies {
  /** Verrouille la journée jusqu'à la fin de l'unité de travail, puis dit si ce réassort y est lancé. */
  abstract isLaunched(day: ServiceDay, resupplyId: string): Promise<boolean>;
}
