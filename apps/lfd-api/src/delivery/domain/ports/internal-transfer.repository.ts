import type { InternalTransfer, TransferItem } from "../entities/internal-transfer.js";

/**
 * Port d'**écriture** du transfert interne (plan du transfert interne, §3,
 * lot T1) : on charge l'agrégat, il se mute par ses méthodes, on le rend.
 * Toute écriture exige en base la version LUE.
 */
export abstract class InternalTransferRepository {
  abstract load(id: string): Promise<InternalTransfer | null>;

  /** Les transferts PRÉVUS (non partis) de ce site ce jour-là, du plus ancien au plus récent. */
  abstract plannedOf(serviceDay: string, siteId: string): Promise<readonly InternalTransfer[]>;

  /** Le transfert qui porte déjà cet élément, tous jours confondus ; `null` si aucun. */
  abstract holderOf(item: TransferItem): Promise<string | null>;

  /**
   * Écrit un transfert (ouverture ou changement) : ses éléments neufs, et son
   * manifeste au départ.
   * @throws {InternalTransferStaleError} la version en base n'est plus celle lue.
   */
  abstract save(transfer: InternalTransfer): Promise<void>;
}
