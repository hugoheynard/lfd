import type { CollectionReturnView } from '@lfd/contracts';

/** Un retour à traiter. Des dates seulement affichées : aucune n'est comparée à l'horloge. */
export function collectionReturn(
  overrides: Partial<CollectionReturnView> = {},
): CollectionReturnView {
  return {
    id: 'ret_1',
    endToEndId: 'E2E-1',
    batchId: 'lot_1',
    batchLabel: 'Lot B2B 202609',
    lineRank: 1,
    debtorCompanyId: 'co_port',
    debtorName: 'Boulangerie du Port',
    mandateId: 'mdt_1',
    mandateReference: 'RUM-1',
    kind: 'reject',
    reasonCode: 'AM04',
    reason: 'Provision insuffisante',
    returnedOn: '2026-10-16',
    amountCents: 12_345,
    feeCents: 750,
    source: 'manual',
    recordedAt: '2026-10-17T08:00:00.000Z',
    resolution: 'pending',
    resolutionNote: null,
    resolvedAt: null,
    gestures: { representRefusal: null, proposesRevocation: false },
    ...overrides,
  };
}
