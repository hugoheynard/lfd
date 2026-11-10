import type { ShopCopyEntryState } from "../shop-copy-entry.js";

/** La publication courante, telle que l'écran l'annonce. */
export interface ShopCopyPublicationState {
  readonly version: number;
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
}

/**
 * Port de lecture de **l'éditeur** : toutes les lignes et la publication. Pas
 * de cache : quelques personnes l'ouvrent, et elles doivent voir l'état exact.
 */
export abstract class ShopCopyAdminReader {
  abstract entries(): Promise<readonly ShopCopyEntryState[]>;
  abstract publication(): Promise<ShopCopyPublicationState>;
}
