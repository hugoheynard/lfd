import type { CatalogOperationFacts } from "../entities/catalog-operation.js";

/** Une opération du miroir, sa date de retrait, et ce que le commerce en tient. */
export interface ReceivedOperation {
  readonly received: CatalogOperationFacts;
  /** `null` = tenue ; sinon l'instant de son retrait. */
  readonly withdrawnAt: Date | null;
  /** Masquée par le commerce. */
  readonly hidden: boolean;
}

/**
 * Port de **lecture** de l'éditeur de vitrine : TOUTES les opérations du
 * miroir, retirées comprises. Distinct de `CatalogOperationsReader` (ISP) :
 * l'éditeur ne lit pas ce qu'un vendeur lit.
 *
 * Il servait aussi l'écran de réception et sa surcharge, partis en X2
 * (2026-10-17).
 */
export abstract class ReceivedOperationsReader {
  /** L'annonce la plus récente d'abord. */
  abstract list(): Promise<readonly ReceivedOperation[]>;
}
