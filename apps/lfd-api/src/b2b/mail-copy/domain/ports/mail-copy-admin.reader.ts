import type { MailCopyEntryState } from "../mail-copy-entry.js";

/** La publication courante, telle que l'écran l'annonce. */
export interface MailCopyPublicationState {
  readonly version: number;
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
}

/**
 * Port de lecture de **l'éditeur** et de l'aperçu : toutes les lignes, la
 * publication. Pas de cache : quelques personnes l'ouvrent, et elles doivent
 * voir l'état exact — l'aperçu d'un brouillon qu'on vient d'écrire compris.
 */
export abstract class MailCopyAdminReader {
  abstract entries(): Promise<readonly MailCopyEntryState[]>;
  abstract publication(): Promise<MailCopyPublicationState>;
}
