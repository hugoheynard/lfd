import type { ReceivedOperationView } from '@lfd/contracts';

/**
 * Une opération reçue pour les specs — Noël, sans surcharge.
 *
 * Ses dates ne sont comparées qu'entre elles, jamais à l'horloge : elles
 * peuvent rester absolues (CLAUDE.md §5, l'exception étroite).
 */
export function receivedOperation(
  over: Partial<ReceivedOperationView> = {},
): ReceivedOperationView {
  const skus = over.skus ?? ['BUCHE-4', 'BUCHE-8', 'GALETTE-1'];
  return {
    key: 'noel-2026',
    name: { fr: 'Noël' },
    lede: null,
    image: null,
    announceFrom: '2026-11-01T09:00:00.000Z',
    orderFrom: null,
    orderUntil: '2026-12-21T11:00:00.000Z',
    pickupFrom: '2026-12-20',
    pickupUntil: '2026-12-24',
    audience: 'both',
    skus,
    receivedAt: '2026-10-30T09:00:00.000Z',
    withdrawn: false,
    withdrawnAt: null,
    override: null,
    effective: {
      isHidden: false,
      orderUntil: '2026-12-21T11:00:00.000Z',
      audience: 'both',
      skus,
    },
    ...over,
  };
}
