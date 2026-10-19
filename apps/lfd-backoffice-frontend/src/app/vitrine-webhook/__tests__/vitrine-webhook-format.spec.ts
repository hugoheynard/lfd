import type { VitrineDeliveryView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { deliverySummary, deliveryTitle } from '../vitrine-webhook-format';

const NONE = { items: [], operations: [], shelves: [], texts: [] };

function delivery(overrides: Partial<VitrineDeliveryView> = {}): VitrineDeliveryView {
  return {
    id: 'd1',
    dispatchId: 'disp_1',
    kind: 'change',
    sequence: 3,
    state: 'delivered',
    attempts: 1,
    nextAttemptAt: null,
    lastError: null,
    lastStatus: 204,
    changed: NONE,
    removed: NONE,
    createdAt: '2026-10-18T08:00:00.000Z',
    deliveredAt: '2026-10-18T08:00:01.000Z',
    ...overrides,
  };
}

describe('le résumé d’un envoi', () => {
  it('compte par ensemble, au singulier et au pluriel', () => {
    expect(
      deliverySummary(
        delivery({
          changed: { ...NONE, items: ['A', 'B'], texts: ['t'] },
          removed: { ...NONE, items: ['C'] },
        }),
      ),
    ).toBe('Changés : 2 articles, 1 texte · Retirés : 1 article');
  });

  it('dit ce qu’est un essai, et le nomme', () => {
    const test = delivery({ kind: 'test', sequence: null });
    expect(deliverySummary(test)).toBe('Essai — aucun changement annoncé');
    expect(deliveryTitle(test)).toBe('Essai');
    expect(deliveryTitle(delivery())).toBe('Envoi n° 3');
  });
});
