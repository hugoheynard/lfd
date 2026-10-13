/**
 * **« Réceptionner »** au comptoir du site (plan du transfert interne, §6.3,
 * Q-T6, lot T2) — le personnel reçoit le transfert qui porte une commande.
 *
 * ⚠️ Le plan le disait « déclaré par `handover` (`handover/channels/delivery/`),
 * implémenté par `delivery` ». Impossible sous la matrice : implémenter un port
 * de `handover/` demande `delivery → handover`, interdit (CLAUDE.md §3,
 * `lint:context-boundaries`). Il est donc déclaré ET implémenté par la
 * livraison, dans SON canal vers le retrait — la forme des lecteurs « des deux
 * sens » (2026-10-08). Écart remonté au plan le 2026-10-13.
 *
 * Il ouvre SA transaction : la réception, son fait de journal, ensemble.
 */
export abstract class TransferReceptionDesk {
  /**
   * Reçoit le transfert qui porte `orderId`. Parti : réception ordinaire, le
   * motif est facultatif. Prévu : réception MANUELLE, motif obligatoire.
   *
   * @throws {OrderNotInTransferError} aucun transfert ne la porte (404).
   * @throws {TransferAlreadyReceivedError} déjà reçu (409).
   * @throws {TransferReceptionReasonRequiredError} manuelle sans motif (400).
   */
  abstract receiveForOrder(request: TransferReceptionRequest): Promise<void>;
}

/** Qui reçoit (une fiche staff), et pourquoi quand il n'est pas venu par une tournée. */
export interface TransferReceptionRequest {
  readonly orderId: string;
  readonly staffUserId: string;
  readonly reason: string | null;
}
