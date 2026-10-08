import type { CollectionBatchView, CollectionLineNoticeView } from '@lfd/contracts';

/**
 * Les mots de l'**avis de prélèvement** d'une ligne (plan
 * `documentation/facturation/plan-prelevement-automatique.md`, PA2), pour un
 * gérant : envoyé, en attente, échec, non envoyable. Mis en file ne se dit
 * jamais « envoyé » — c'est l'envoi que le dépôt exige.
 */

export type NoticeBadgeVariant = 'success' | 'info' | 'alert' | 'warning';

export interface NoticeBadge {
  readonly label: string;
  readonly variant: NoticeBadgeVariant;
  /** Ce que la ligne précise sous le badge : destinataire, refus, nature de l'avis. */
  readonly detail: string;
}

const KIND_DETAIL: Readonly<Record<CollectionLineNoticeView['kind'], string>> = {
  notice: '',
  correction: 'rectificatif',
  cancellation: 'annulation',
  unchanged: 'avis précédent maintenu',
};

/** Le badge de l'avis d'une ligne. `null` : lot préparé avant les avis. */
export function noticeBadge(notice: CollectionLineNoticeView | null): NoticeBadge {
  if (notice === null) {
    return { label: 'Aucun avis', variant: 'alert', detail: 'lot préparé avant les avis' };
  }
  const kind = KIND_DETAIL[notice.kind];
  const join = (...parts: readonly string[]): string => parts.filter((p) => p !== '').join(' · ');
  switch (notice.status) {
    case 'sent':
      return {
        label: 'Envoyé',
        variant: 'success',
        detail: join(kind, notice.recipientEmail ?? ''),
      };
    case 'queued':
      return {
        label: 'En attente',
        variant: 'info',
        detail: join(kind, notice.recipientEmail ?? ''),
      };
    case 'failed':
      return { label: 'Échec', variant: 'alert', detail: join(kind, notice.failure ?? '') };
    case 'unsendable':
      return {
        label: 'Non envoyable',
        variant: 'warning',
        detail: 'ni contact de facturation, ni détenteur avec une adresse',
      };
  }
}

/** Les payeurs dont l'avis n'est pas parti — le dépôt sera refusé pour eux. */
export function unsentNoticePayers(batch: CollectionBatchView): readonly string[] {
  return batch.lines
    .filter((line) => line.notice?.status !== 'sent')
    .map((line) => `${line.debtorName} (${noticeBadge(line.notice).label.toLowerCase()})`);
}
