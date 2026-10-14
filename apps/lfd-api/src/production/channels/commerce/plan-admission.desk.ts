import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** Ce que le guichet constate, sous le verrou : la journée prend encore des commandes, ou non. */
export type PlanAdmission = "open" | "closed";

/**
 * **Le guichet d'admission au plan** — port que le fournil DÉCLARE et
 * IMPLÉMENTE, et que le commerce appelle quand il écrit une commande (plan
 * `documentation/commandes/plan-reglages-commandes.md`, §8.1, S5, lot O3).
 *
 * ## Pourquoi un verrou, et pas seulement une lecture
 *
 * L'arrêt du plan lit les commandes du commerce, puis prend le verrou de la
 * journée et la ferme. Une commande lue « ouverte » sans verrou, puis écrite
 * après l'arrêt, serait hors du compte à produire sans que personne le sache —
 * c'est l'observation O5. Le guichet prend donc le MÊME verrou
 * (`production_day:<jour>`) puis lit l'état : la passation voit l'arrêt, ou
 * l'arrêt voit la commande — jamais aucun des deux.
 *
 * 🔴 **Dans l'unité de travail de l'appelant** (précédent :
 * `OrderWithdrawalDesk`) : le verrou tient jusqu'à son `COMMIT`.
 *
 * Ordre des verrous : la journée AVANT toute ligne `orders` — une passation
 * n'en verrouille aucune existante, elle en insère une. L'annulation prend
 * la ligne puis la journée, l'arrêt la journée sans toucher `orders` : pas de
 * cycle (C3.4 ter).
 *
 * `production → b2b` reste interdit : le fournil ne sait pas qui l'appelle.
 */
export abstract class PlanAdmissionDesk {
  /** Verrouille la journée jusqu'à la fin de l'unité de travail, puis dit si son plan est arrêté. */
  abstract admit(day: ServiceDay): Promise<PlanAdmission>;
}
