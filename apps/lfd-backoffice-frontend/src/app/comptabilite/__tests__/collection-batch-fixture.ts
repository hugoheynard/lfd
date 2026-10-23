import type { CollectionBatchView } from '@lfd/contracts';

/**
 * Un lot B2B de septembre, préparé, déposable, fichier PAS encore téléchargé.
 * Les dates ne sont comparées qu'entre elles : l'écran n'en calcule aucune.
 */
export function collectionBatch(over: Partial<CollectionBatchView> = {}): CollectionBatchView {
  return {
    id: 'b1',
    scheme: 'B2B',
    cycleStartsAt: '2026-08-31T22:00:00.000Z',
    cycleClosesAt: '2026-09-30T22:00:00.000Z',
    periodLabel: 'du 1er au 30 septembre 2026',
    status: 'constituted',
    constitutedAt: '2026-10-02T09:00:00.000Z',
    constitutedBy: 'staff',
    depositedAt: null,
    cancelledAt: null,
    rejection: null,
    lastDownloadedAt: null,
    lineCount: 2,
    orderCount: 5,
    totalCents: 123_400,
    unmandatedCompanies: [],
    payerModes: ['monthly'],
    depositable: true,
    requestedCollectionDay: '2026-10-15',
    postponedFromDay: null,
    depositDeadline: null,
    lines: [],
    ...over,
  };
}

/** Le même lot, fichier téléchargé : « J'ai déposé » est ouvert. */
export const DOWNLOADED_AT = '2026-10-02T10:00:00.000Z';
