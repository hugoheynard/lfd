/**
 * **« Cette commande est-elle arrivée au site ? »** — ce que le comptoir du
 * retrait demande à la livraison au moment de remettre (plan du transfert
 * interne, §6.1, lot T2).
 *
 * Déclaré ET implémenté par la livraison, comme `RoundPlacementsReader` : le
 * transfert seul sait si la marchandise d'une commande du site est en route
 * ou reçue. `delivery → handover` reste interdit ; ce port ne le demande pas.
 * Lecture synchrone, par lot.
 */
export abstract class TransferStatusReader {
  /**
   * Parmi `orderIds`, celles qui partent par un transfert interne, et où il
   * en est. Une commande absente n'en dépend pas : elle se remet comme un
   * retrait ordinaire.
   *
   * `awaiting` (lot T3, faille F4) : un retrait d'un site servi par
   * transfert qu'aucun transfert ne porte ENCORE — la journée n'est pas
   * clôturée, la marchandise n'est pas faite.
   */
  abstract statusOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderTransferStatus>>;
}

/** Le transfert d'une commande, vu du comptoir. */
export type OrderTransferStatus = CarriedTransferStatus | AwaitingTransferStatus;

/** Un transfert porte la commande. */
export interface CarriedTransferStatus {
  readonly transferId: string;
  readonly siteLabel: string;
  /** Le diagramme du §3 : prévu, parti, reçu. */
  readonly state: "planned" | "departed" | "received";
  /** L'instant de l'état : ouverture, départ ou réception. */
  readonly at: Date;
  /** Les bacs non annulés du transfert (lot T3) — ce que le site doit recevoir. */
  readonly binCount: number;
}

/** Un retrait d'un site servi par transfert qu'aucun transfert ne porte encore (F4). */
export interface AwaitingTransferStatus {
  readonly state: "awaiting";
  readonly siteLabel: string;
}
