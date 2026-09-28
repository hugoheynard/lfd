import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Le verrou d'une journée** — ce qui sérialise l'invariant « au bac ≤ sorti »
 * (plan `plan-fournees-progressives.md`, D4).
 *
 * Trois écrivains le touchent : mettre au bac (ou ressortir), annuler une
 * fournée, et `save` de la journée (clôture, retirage), qui réécrit les lignes
 * de colisage. Un verrou par ligne du compte ne tiendrait pas — `save` la
 * détruit. Il porte donc sur la ligne `production_day`, que personne ne
 * supprime, et chacun des trois le prend PUIS relit la journée sous lui.
 *
 * 🔴 Il n'a de sens que DANS une unité de travail : pris hors transaction, il
 * serait relâché à la fin de sa propre requête. L'adaptateur le refuse.
 *
 * Un port à part (ISP) : les lecteurs de la journée n'ont rien à verrouiller.
 */
export abstract class ProductionDayLock {
  /** Prend le verrou jusqu'à la fin de l'unité de travail en cours. */
  abstract lock(day: ServiceDay): Promise<void>;
}
