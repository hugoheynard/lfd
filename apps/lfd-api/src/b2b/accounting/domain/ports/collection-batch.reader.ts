import type { CollectionBatchView, CollectionExclusionView } from "@lfd/contracts";

import type { BatchCsvLine } from "../services/collection-batch-csv.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/** Ce qui nomme le fichier d'un lot, et ce qu'il faut pour le relire. */
export interface StoredBatchFile {
  readonly batchId: string;
  readonly scheme: SepaScheme;
  readonly creditorSiren: string;
  readonly cycleClosesAt: Date;
  readonly depositable: boolean;
  readonly status: CollectionBatchView["status"];
  readonly xml: string;
  readonly fileSha256: string;
}

/**
 * Port de LECTURE des lots — l'écran du cycle et les téléchargements. Il ne
 * rend jamais l'agrégat : une lecture n'a rien à muter.
 */
export abstract class CollectionBatchReader {
  /** Les lots d'une entité, le plus récent d'abord. */
  abstract list(legalEntityId: string): Promise<readonly CollectionBatchView[]>;

  /** Les commandes écartées aujourd'hui, toutes entités confondues. */
  abstract exclusions(): Promise<readonly CollectionExclusionView[]>;

  abstract file(batchId: string): Promise<StoredBatchFile | null>;

  /** Les lignes figées, pour le CSV de contrôle. */
  abstract auditLines(batchId: string): Promise<readonly BatchCsvLine[]>;
}
