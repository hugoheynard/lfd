import type { CollectionBatchView, CollectionExclusionView } from "@lfd/contracts";

import type { BatchCsvLine } from "../services/collection-batch-csv.js";
import type { LotPayerRef } from "../services/lot-payer-modes.js";
import type { SepaScheme } from "../value-objects/sepa-scheme.js";

/** Ce qui nomme le fichier d'un lot, et ce qu'il faut pour le relire. */
export interface StoredBatchFile {
  readonly batchId: string;
  readonly legalEntityId: string;
  readonly scheme: SepaScheme;
  /** `AAAA-MM-JJ` — l'échéance demandée ; `null` pour un lot d'avant le 2026-10-08. */
  readonly collectionDay: string | null;
  /** Le nombre de débits (lignes) du fichier. */
  readonly debitCount: number;
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
/**
 * Un lot tel que la base le rend : la vue, sans les modes de ses clients —
 * qui demandent le calendrier — mais avec ce qu'il faut pour les calculer.
 */
export type StoredBatchView = Omit<CollectionBatchView, "payerModes"> & {
  /** Une entrée par facture prélevée ; une par ligne d'arrêté (`invoiceId: null`). */
  readonly payerRefs: readonly LotPayerRef[];
};

export abstract class CollectionBatchReader {
  /** Les lots d'une entité, le plus récent d'abord. */
  abstract list(legalEntityId: string): Promise<readonly StoredBatchView[]>;

  /** Les commandes écartées aujourd'hui, toutes entités confondues. */
  abstract exclusions(): Promise<readonly CollectionExclusionView[]>;

  abstract file(batchId: string): Promise<StoredBatchFile | null>;

  /** Les lignes figées, pour le CSV de contrôle. */
  abstract auditLines(batchId: string): Promise<readonly BatchCsvLine[]>;
}
