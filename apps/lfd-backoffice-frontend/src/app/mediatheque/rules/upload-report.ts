import type { FoldBadgeVariant } from 'fold-ng';

import type { UploadEntry, UploadState } from './upload-entry';

/**
 * **Le compte rendu d'un dépôt**, dit en mots — la pastille de chaque ligne,
 * et ce qu'on dit d'une image qui était déjà au fonds.
 */

/** Le choix qui ouvre le panneau de création — jamais un identifiant ULID. */
export const NEW_SERIES = '__new__';

/** Ce que dit la pastille d'état de chaque ligne du compte rendu. */
export const STATE_BADGES: Readonly<
  Record<UploadState, { readonly label: string; readonly variant: FoldBadgeVariant }>
> = {
  waiting: { label: 'En attente', variant: 'neutral' },
  sending: { label: 'Envoi…', variant: 'accent' },
  deposited: { label: 'Déposé', variant: 'success' },
  already_in_library: { label: 'Déjà au fonds', variant: 'info' },
  refused: { label: 'Refusé', variant: 'alert' },
};

/**
 * Ce qu'on dit d'une image déjà au fonds (Hugo, 2026-10-10) : elle GARDE
 * sa série d'origine. Sans alarme — rien n'est perdu, rien n'a changé.
 *
 * @param findTitle le titre d'une série connue, `null` si on ne la connaît pas.
 */
export function alreadyNote(
  entry: UploadEntry,
  batchSeriesId: string | null,
  findTitle: (id: string) => string | null,
): string {
  const origin = entry.seriesId;
  if (origin === null) {
    return batchSeriesId === null
      ? 'Rien n’a changé.'
      : 'Elle n’a pas de série et n’en reçoit pas : un redépôt ne la change pas.';
  }
  if (origin === batchSeriesId) {
    return 'Elle est déjà dans cette série.';
  }
  const title = findTitle(origin);
  return title === null
    ? 'Elle garde sa série d’origine.'
    : `Elle garde sa série d’origine, « ${title} ».`;
}
