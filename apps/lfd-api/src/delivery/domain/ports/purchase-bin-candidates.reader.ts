import type { PurchaseBinCandidateView } from "@lfd/contracts";

/**
 * Port de **lecture** des formats de bacs candidats — distinct du port
 * d'écriture (ISP) et de `BinCatalogReader` : le colisage ne voit jamais un
 * candidat (B-D1).
 */
export abstract class PurchaseBinCandidatesReader {
  /** Par nom ; les archivés seulement si `includeArchived`. */
  abstract list(includeArchived: boolean): Promise<readonly PurchaseBinCandidateView[]>;
}
