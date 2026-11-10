import type { OrderCollection } from "../entities/order-collection.js";

/** Port d'ÉCRITURE des états d'encaissement. */
export abstract class OrderCollectionRepository {
  /**
   * L'état d'une commande prélevable (critère de l'assiette, après le
   * plancher) — `due` si aucune ligne ; `null` si la commande n'est pas
   * prélevable du tout.
   */
  abstract load(orderId: string): Promise<OrderCollection | null>;

  /**
   * La ligne d'UNE commande telle qu'elle est en base, hors assiette —
   * `null` si aucune (elle vaut alors `due`). Pour la fermer à l'annulation
   * (C5.4) : `load` ne la rendrait plus une fois la commande annulée.
   */
  abstract ofOrder(orderId: string): Promise<OrderCollection | null>;

  /** Les commandes portées par les lignes d'un lot. */
  abstract ofBatch(batchId: string): Promise<readonly OrderCollection[]>;

  /** Les commandes portées par UNE ligne — celles qu'un retour bancaire touche. */
  abstract ofLine(batchId: string, rank: number): Promise<readonly OrderCollection[]>;

  abstract saveAll(collections: readonly OrderCollection[]): Promise<void>;
}
