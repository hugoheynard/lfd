import type { NoShowTrace } from "../entities/order-no-show.js";

/** Ce que la fiche d'une commande non retirée dit : qui l'a déclarée, qui a prévenu le client. */
export interface OrderNoShowTraces {
  readonly declared: NoShowTrace;
  /** L'e-mail « commande non retirée » DEMANDÉ ; `null` tant que personne ne l'a demandé. */
  readonly noticeRequested: NoShowTrace | null;
}

/** Port de **lecture** des traces d'une commande non retirée, pour la fiche staff. */
export abstract class OrderNoShowReader {
  /** `null` : commande inconnue, ou pas déclarée non retirée. */
  abstract of(orderId: string): Promise<OrderNoShowTraces | null>;
}
