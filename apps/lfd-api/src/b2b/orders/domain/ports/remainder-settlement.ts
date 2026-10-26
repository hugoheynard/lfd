import type { HandoverVia } from "../services/handover.js";

/** La remise d'un reste, telle que le retrait l'a attestée. */
export interface RemainderHandoverAct {
  readonly orderId: string;
  /** La fiche staff qui a remis, figée par le fait. */
  readonly handedOverBy: string;
  /** L'instant du retrait du reste — pas l'heure d'ici. */
  readonly handedOverAt: Date;
  readonly via: HandoverVia;
}

/**
 * **Le dernier reste remis solde la commande** (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 8, lot L5b).
 *
 * Déclaré par les commandes, appelé par les bons de livraison dans l'unité de
 * travail qui remet le BL du reste, sous le verrou de la commande. Les
 * commandes gardent leur statut et leur fait (`order.fulfilled`) ; le solde
 * des montants reste à l'écrivain du solde (`OrderBillingCloser`), que
 * l'appelant lance quand ce port rend `true`.
 */
export abstract class RemainderSettlement {
  /**
   * Passe la commande `fulfilled` et publie `order.fulfilled` si ce reste
   * était le dernier envoi à remettre et que le rang 1 est retiré.
   *
   * @returns `true` : la commande vient d'être soldée.
   */
  abstract settleIfComplete(act: RemainderHandoverAct): Promise<boolean>;
}
