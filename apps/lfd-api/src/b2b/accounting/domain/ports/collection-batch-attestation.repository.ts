import type { CollectionBatchAttestations } from "../entities/collection-batch-attestation.js";

/**
 * Port d'ÉCRITURE des attestations d'un lot : il prend et rend l'agrégat. Le
 * registre n'est fait que d'ajouts — `save` n'écrit que les lignes
 * nouvelles, jamais ne modifie ni n'efface.
 */
export abstract class CollectionBatchAttestationRepository {
  /** Le lot et toutes ses lignes ; `null` si le lot n'existe pas. */
  abstract load(batchId: string): Promise<CollectionBatchAttestations | null>;
  abstract save(attestations: CollectionBatchAttestations): Promise<void>;
}
