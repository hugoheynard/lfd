import type {
  CollectionProcedureBatchView,
  CollectionProcedureRowView,
  CollectionProcedureView,
} from '@lfd/contracts';

/**
 * Une lecture d'état de la procédure (S1), telle que le serveur la rend :
 * lot mensuel d'octobre à déposer, comptes faits, deux mandats à exporter.
 * Les dates ne sont comparées qu'entre elles — l'écran n'en calcule aucune.
 */
export function procedureBatch(
  over: Partial<CollectionProcedureBatchView> = {},
): CollectionProcedureBatchView {
  return {
    id: 'b1',
    procedureId: 'le1~2026-11-01',
    scheme: 'B2B',
    periodLabel: 'du 1er au 31 octobre 2026',
    payerModes: ['monthly'],
    status: 'constituted',
    requestedCollectionDay: '2026-11-16',
    depositDeadline: { day: '2026-11-12', time: '13:45' },
    cancelledAt: null,
    ...over,
  };
}

export function procedureView(
  over: Partial<CollectionProcedureView> = {},
): CollectionProcedureView {
  return {
    legalEntityId: 'le1',
    followed: procedureBatch(),
    replacementBatchId: null,
    toPrepare: null,
    openBatches: [procedureBatch()],
    accounts: { state: 'done', toExportCount: 0, inFlightCount: 0, excludedCount: 0 },
    mandates: { state: 'to_do', toExportCount: 2, awaitingImport: false, excludedCount: 0 },
    file: {
      state: 'to_do',
      reason: 'to_deposit',
      mandatesNotImportedCount: 2,
      excludedMandateCount: 0,
      excludedAccountCount: 0,
      tightDepositMargin: null,
    },
    returns: {
      state: 'locked',
      reason: 'not_deposited',
      pendingReturnCount: 0,
      watchUntilDay: null,
    },
    arrivalStep: 'mandates',
    ...over,
  };
}

/** Une ligne de la table des procédures (§ 11) : la procédure d'octobre, à déposer. */
export function procedureRow(
  over: Partial<CollectionProcedureRowView> = {},
): CollectionProcedureRowView {
  return {
    id: 'le1~2026-11-01',
    legalEntityId: 'le1',
    closesAt: '2026-10-31T23:00:00.000Z',
    closureDay: '2026-11-01',
    periodLabel: 'du 1er au 31 octobre 2026',
    modes: ['monthly'],
    phase: 'open',
    stage: 'file',
    batches: [{ id: 'b1', scheme: 'B2B', status: 'constituted' }],
    followedBatchId: 'b1',
    collectionDay: '2026-11-16',
    depositDeadline: { day: '2026-11-12', time: '13:45' },
    deposited: false,
    warnings: [],
    ...over,
  };
}
