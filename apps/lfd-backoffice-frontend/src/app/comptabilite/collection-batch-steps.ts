import type { CollectionBatchView } from '@lfd/contracts';

/**
 * **Ce qu'un lot permet, dans l'ordre de la procédure** — partagé par
 * « Prélèvement du mois » et l'onglet « Fichier » de la procédure, pour que
 * les deux écrans ouvrent les mêmes gestes (Hugo, 2026-10-23).
 *
 * Le serveur reste juge : « J'ai déposé » sur un fichier jamais téléchargé et
 * « Annuler » sur un lot déposé y sont refusés en 409. L'écran ne fait que ne
 * pas les proposer.
 */

/** Le fichier de remise de CE lot a été téléchargé au moins une fois. */
export function fileDownloaded(batch: CollectionBatchView): boolean {
  return batch.lastDownloadedAt !== null;
}

/**
 * « Annuler » : avant dépôt seulement. Un lot déposé dont la remise est signée
 * ferait prélever deux fois (procédure de prélèvement, § 7).
 */
export function cancellable(batch: CollectionBatchView): boolean {
  return batch.status === 'constituted';
}

/** Pourquoi « J'ai déposé » est fermé, ou `null` s'il est ouvert. */
export function depositClosedReason(batch: CollectionBatchView): string | null {
  if (batch.status !== 'constituted') {
    return batch.status === 'deposited' ? 'Lot déjà déposé.' : 'Lot annulé.';
  }
  if (!batch.depositable) {
    return 'Lot non déposable : voir l’encadré du lot.';
  }
  return fileDownloaded(batch) ? null : 'Téléchargez d’abord le fichier de remise.';
}
