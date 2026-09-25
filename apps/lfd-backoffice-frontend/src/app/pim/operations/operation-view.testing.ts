import type { OperationView } from '@lfd/pim-contracts';

/**
 * Une opération de Noël, pour les specs de l'écran. Ses dates ne sont jamais
 * comparées à l'horloge : l'état vient du champ `state`, posé à la main — c'est
 * le serveur qui le calcule (D2), et l'écran ne fait que le dire.
 */
export function operationView(over: Partial<OperationView> = {}): OperationView {
  return {
    key: 'noel-2026',
    name: { fr: 'Noël 2026', en: 'Christmas 2026' },
    lede: null,
    image: null,
    announceFrom: '2026-10-31T23:00:00.000Z',
    orderFrom: null,
    orderUntil: '2026-12-21T11:00:00.000Z',
    pickupFrom: '2026-12-23',
    pickupUntil: '2026-12-24',
    audience: 'both',
    skus: [],
    archivedAt: null,
    state: 'preparing',
    ...over,
  };
}
