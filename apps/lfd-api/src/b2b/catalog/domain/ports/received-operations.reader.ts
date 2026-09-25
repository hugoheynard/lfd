import type { CatalogOperationFacts } from "../entities/catalog-operation.js";
import type { CatalogOperationOverrideState } from "../entities/catalog-operation-override.js";

/** Une opération du miroir, sa date de retrait, et ce que la réception en a décidé. */
export interface ReceivedOperation {
  readonly received: CatalogOperationFacts;
  /** `null` = tenue ; sinon l'instant de l'envoi qui ne la portait plus. */
  readonly withdrawnAt: Date | null;
  readonly override: CatalogOperationOverrideState | null;
}

/**
 * Port de **lecture** de l'écran de réception : TOUTES les opérations reçues,
 * retirées comprises (l'écran les dit « opération retirée »), avec leur
 * surcharge. Distinct du dépôt (ISP) : l'écran n'écrit rien, et il ne lit pas
 * ce qu'un vendeur lit.
 */
export abstract class ReceivedOperationsReader {
  /** L'annonce la plus récente d'abord. */
  abstract list(): Promise<readonly ReceivedOperation[]>;
}
