import type { CarriedTransferStatus } from "./transfer-status.reader.js";

/**
 * **« Quels transferts de réassort seul arrivent ici ce jour-là ? »** (R3c,
 * R3e) — ce que le comptoir demande à la livraison pour montrer, et
 * réceptionner, un transfert qu'aucune commande de sa file ne désigne.
 *
 * Déclaré ET implémenté par la livraison, comme `TransferStatusReader` ;
 * `delivery → handover` reste interdit. Port à part : la file par commande
 * n'en a pas besoin, et un lecteur ne dépend que de ce qu'il appelle.
 */
export abstract class ResupplyTransfersReader {
  /**
   * Les transferts de cette journée de service qui portent au moins un
   * réassort et aucune commande (éléments PORTÉS seulement), quel que soit
   * leur état — un reçu reste à l'écran, comme pour une commande.
   */
  abstract resupplyOnlyOn(serviceDay: string): Promise<readonly ResupplyOnlyTransferStatus[]>;
}

/** Un transfert de réassort seul, vu du comptoir. */
export interface ResupplyOnlyTransferStatus extends CarriedTransferStatus {
  /** Le site servi, identifiant opaque du commerce : l'onglet du comptoir. */
  readonly siteId: string;
  /** Les réassorts qu'il porte. */
  readonly resupplyCount: number;
}
