import type { MonthlyClosureBatchView } from "@lfd/contracts";

/** Un lot, rattaché à la clôture qui le ferme. */
export interface ClosureBatchRead {
  readonly closesAt: Date;
  readonly batch: MonthlyClosureBatchView;
}

/**
 * Port de LECTURE des lots par clôture, pour la liste des clôtures de l'écran
 * « Prélèvement du mois » (M4c). Séparé de `CollectionBatchReader` : la liste
 * ne lit ni les lignes, ni les avis, ni le fichier — un résumé par lot.
 */
export abstract class ClosureBatchesReader {
  /** Les lots de l'entité clos à l'une de ces clôtures, annulés compris. */
  abstract ofClosures(
    legalEntityId: string,
    closures: readonly Date[],
  ): Promise<readonly ClosureBatchRead[]>;
}
