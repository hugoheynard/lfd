import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/**
 * **Le verrou d'une journée** — ce qui sérialise l'invariant « au bac ≤ sorti »
 * (plan `plan-fournees-progressives.md`, D4).
 *
 * Trois écrivains le touchent : mettre au bac (ou ressortir), annuler une
 * fournée, et `save` de la journée (clôture, retirage), qui réécrit les lignes
 * de colisage. Un verrou par ligne du compte ne tiendrait pas — `save` la
 * détruit. Il porte donc sur la journée elle-même — y compris une journée
 * sans ligne, que la clôture doit sérialiser aussi (lot A0, 2026-10-06) — et
 * chacun le prend PUIS relit la journée sous lui.
 *
 * 🔴 Il n'a de sens que DANS une unité de travail : pris hors transaction, il
 * serait relâché à la fin de sa propre requête. L'adaptateur le refuse.
 *
 * Un port à part (ISP) : les lecteurs de la journée n'ont rien à verrouiller.
 *
 * Il est EXCLUSIF. Le colisage et la livraison prennent la même clé en mode
 * PARTAGÉ par `ArrestedPlanHold` (`channels/packing/`, 2026-11-02) : leurs
 * gestes ne s'attendent pas entre eux, mais la réouverture les attend.
 *
 * 🔴 **Jamais tenu avec le verrou du stock de la vitrine** (`ShelfStockLock`,
 * `lafoliecoffee/resupply`) : une commande prise sur la vitrine n'entre jamais au plan,
 * et aucun chemin ne prend les deux — deux verrous qu'aucune transaction ne
 * tient ensemble ne s'attendent pas en cercle (plan
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`).
 */
export abstract class ProductionDayLock {
  /** Prend le verrou jusqu'à la fin de l'unité de travail en cours. */
  abstract lock(day: ServiceDay): Promise<void>;
}
