import type { OrderCollection } from "../entities/order-collection.js";

/** Port d'ÉCRITURE des états d'encaissement. */
export abstract class OrderCollectionRepository {
  /**
   * L'état d'une commande prélevable (critère de l'assiette, après le
   * plancher) — `due` si aucune ligne ; `null` si la commande n'est pas
   * prélevable du tout.
   */
  abstract load(orderId: string): Promise<OrderCollection | null>;

  /** Les commandes portées par les lignes d'un lot. */
  abstract ofBatch(batchId: string): Promise<readonly OrderCollection[]>;

  /** Les commandes portées par UNE ligne — celles qu'un retour bancaire touche. */
  abstract ofLine(batchId: string, rank: number): Promise<readonly OrderCollection[]>;

  abstract saveAll(collections: readonly OrderCollection[]): Promise<void>;
}
