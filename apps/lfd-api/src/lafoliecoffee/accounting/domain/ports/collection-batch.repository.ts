import type { CollectionBatch } from "../entities/collection-batch.js";

/** Port d'ÉCRITURE du lot : il prend et rend l'agrégat, rien d'autre. */
export abstract class CollectionBatchRepository {
  abstract load(batchId: string): Promise<CollectionBatch | null>;
  abstract save(batch: CollectionBatch): Promise<void>;
}
