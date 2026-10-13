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
   * Parmi `orderIds`, celles qu'un transfert interne porte, et où il en est.
   * Une commande absente n'est dans aucun transfert : elle se remet comme un
   * retrait ordinaire.
   */
  abstract statusOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderTransferStatus>>;
}

/** Le transfert d'une commande, vu du comptoir. */
export interface OrderTransferStatus {
  readonly transferId: string;
  readonly siteLabel: string;
  /** Le diagramme du §3 : prévu, parti, reçu. */
  readonly state: "planned" | "departed" | "received";
  /** L'instant de l'état : ouverture, départ ou réception. */
  readonly at: Date;
}
