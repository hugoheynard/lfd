import type { CollectionNotice } from "../entities/collection-notice.js";

/**
 * Port d'ÉCRITURE des avis de prélèvement (PA2). Un avis s'écrit avec son lot,
 * puis ne change que d'état — `queued` → `sent` | `failed` — par `save`.
 */
export abstract class CollectionNoticeRepository {
  /** Les avis d'une constitution, dans la transaction du lot. */
  abstract insertAll(notices: readonly CollectionNotice[]): Promise<void>;

  abstract load(noticeId: string): Promise<CollectionNotice | null>;

  /** L'état et ses tampons seulement : ce que l'avis annonce ne se réécrit pas. */
  abstract save(notice: CollectionNotice): Promise<void>;
}
