import type { InternalTransfer } from "../entities/internal-transfer.js";

/** Un transfert prévu sans arrêt vivant : à placer dans une tournée. */
export interface UnplacedTransferRow {
  readonly id: string;
  readonly siteId: string;
}

/**
 * Port de **lecture** du transfert interne (plan du transfert interne, lot
 * T1) — distinct du port d'écriture (ISP) : la composition cherche ce qui
 * reste à placer, le manifeste relit un transfert sans le verrouiller.
 */
export abstract class InternalTransfersReader {
  /**
   * Les transferts PRÉVUS de ce jour, portant au moins un élément (une
   * commande ou, depuis R3c, un réassort), qu'aucun arrêt vivant n'emporte —
   * du plus ancien au plus récent.
   */
  abstract unplacedOn(serviceDay: string): Promise<readonly UnplacedTransferRow[]>;

  /** Un transfert, pour le lire (manifeste) ; `null` s'il n'existe pas. */
  abstract byId(id: string): Promise<InternalTransfer | null>;
}

/**
 * **Quelles commandes partent par un transfert interne ?** — lu par la
 * déclaration des bacs (plan du transfert interne, §5, §8) : un retrait d'un
 * site servi par transfert reçoit des bacs comme une livraison, un par
 * commande (Q-T4).
 */
export abstract class TransferredOrdersReader {
  /** Parmi ces commandes, celles qu'un transfert interne porte. */
  abstract transferredAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>>;
}
