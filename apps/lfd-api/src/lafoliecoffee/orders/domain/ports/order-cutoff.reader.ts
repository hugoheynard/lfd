import type { OrderCutoffView } from "@lfd/contracts";

/**
 * Port de **lecture** des règles d'heure limite, vu par le contexte `orders`.
 *
 * Volontairement plus étroit que `OrderCutoffRepository` : composer une commande
 * n'autorise pas à créer, modifier ou supprimer une règle. Un consommateur ne
 * dépend que des méthodes qu'il appelle réellement, et c'est ce qui empêche
 * qu'une garde se mette un jour à « corriger » le réglage qu'elle vérifie.
 *
 * L'implémentation est celle du contexte `order-cutoffs` — un seul lecteur de la
 * table, une seule façon de la trier.
 */
export abstract class OrderCutoffReader {
  /** Toutes les règles. L'ordre n'importe pas : `resolveOrderCutoff` est juste quel qu'il soit. */
  abstract list(): Promise<readonly OrderCutoffView[]>;
}
