import type { PackingSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { bagReadiness, readyVerdict } from './bag-readiness';

function sheet(overrides: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference: 'CMD-1',
    containers: 0,
    customerLabel: 'Client',
    fulfillmentMethod: 'pickup',
    destination: 'Boutique',
    lines: [],
    lineCount: 0,
    packedLines: 0,
    remainingLines: 0,
    pieces: 0,
    packedPieces: 0,
    canDeclareReady: false,
    packedAt: null,
    packedBy: null,
    packedByName: null,
    ...overrides,
  };
}

describe('bagReadiness', () => {
  it('ne dit rien sans fiche de colis', () => {
    expect(bagReadiness(null)).toBeNull();
  });

  it('un four fini sans bac fermé n’est pas prêt', () => {
    const bag = bagReadiness(sheet({ packedLines: 0 }));

    expect(bag?.oven.complete).toBe(true);
    expect(bag?.packing.complete).toBe(false);
    expect(bag?.ready).toBe(false);
  });

  it('le bac fermé fait foi, pas le compte des lignes posées', () => {
    const bag = bagReadiness(sheet({ packedAt: '2026-09-28T03:12:00.000Z' }));

    expect(bag?.ready).toBe(true);
  });
});

describe('readyVerdict', () => {
  /** Régression 2026-09-28 : « Déclarée prête » au-dessus de deux barres vides. */
  it('suit le bac quand la fiche existe, même si la commande se dit prête', () => {
    const entry = {
      orderId: 'o',
      reference: 'CMD-1',
      customerLabel: 'Client',
      tradeName: null,
      clientele: 'pro' as const,
      pickupLabel: 'Boutique',
      fulfillmentMethod: 'pickup' as const,
      window: null,
      totalUnits: 1,
      placedAt: 'x',
      state: 'ready' as const,
      handedOverAt: null,
      handedOverVia: null,
      readyAt: '2026-09-28T03:00:00.000Z',
      heldForQuality: false,
    };

    expect(
      readyVerdict(entry, bagReadiness(sheet({ lineCount: 2, packedLines: 0 }))).text,
    ).toContain('Pas encore prête');
    expect(readyVerdict(entry, null).text).toBe('Déclarée prête par le fournil.');
  });
});
