import type { BatchAttestationLine } from "../services/collection-batch-attestations.js";

/**
 * Port de LECTURE des attestations des lots — ce que la procédure lit pour
 * l'onglet 3 et la table. Distinct du port d'écriture (ISP) : la lecture n'a
 * pas besoin de l'agrégat. Quelques lignes par lot, lues d'un coup.
 */
export abstract class CollectionBatchAttestationsReader {
  /** Toutes les lignes de ces lots, retraits compris. */
  abstract ofBatches(batchIds: readonly string[]): Promise<readonly BatchAttestationLine[]>;
}
