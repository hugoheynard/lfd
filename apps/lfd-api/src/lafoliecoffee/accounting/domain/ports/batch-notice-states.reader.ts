import type { CollectionNoticeStatus } from "../entities/collection-notice.js";

/** L'état de l'avis de chaque ligne d'un lot, par rang — ce que le dépôt exige. */
export abstract class BatchNoticeStatesReader {
  /** Une ligne absente de la carte n'a pas d'avis (lot d'avant PA2). */
  abstract ofBatch(batchId: string): Promise<ReadonlyMap<number, CollectionNoticeStatus>>;
}
