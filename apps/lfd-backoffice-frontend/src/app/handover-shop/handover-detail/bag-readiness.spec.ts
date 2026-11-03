import type { PackingLine, PackingSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { bagReadiness, gestureCaution, lineMarks, pieceCount, readyVerdict } from './bag-readiness';

function sheet(overrides: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference: 'CMD-1',
    orderId: 'o-CMD-1',
    containers: 0,
    customerLabel: 'Client',
    clientele: null,
    fulfillmentMethod: 'pickup',
    destination: 'Boutique',
    lines: [],
    lineCount: 0,
    packedLines: 0,
    remainingLines: 0,
    pieces: 0,
    packedPieces: 0,
    canReportShortfall: false,
    shortfallReportedAt: null,
    deliveryNoteReprintNeeded: false,
    canDeclareReady: false,
    coldOutsideIsotherm: [],
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

const ENTRY = {
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

describe('readyVerdict', () => {
  /** Régression 2026-09-28 : « Déclarée prête » au-dessus de deux barres vides. */
  it('suit le bac quand la fiche existe, même si la commande se dit prête', () => {
    const entry = ENTRY;

    expect(
      readyVerdict(entry, bagReadiness(sheet({ lineCount: 2, packedLines: 0 }))).text,
    ).toContain('Pas encore prête');
    expect(readyVerdict(entry, null).text).toBe('Déclarée prête par le fournil.');
  });
});

describe('la retenue du contrôle qualité (lot QC5)', () => {
  const closedBag = bagReadiness(sheet({ packedAt: '2026-09-28T03:12:00.000Z' }));
  const held = { ...ENTRY, heldForQuality: true };

  it('🔴 un sac fermé ne dit PAS « prête à remettre » quand la commande est retenue', () => {
    const verdict = readyVerdict(held, closedBag);

    expect(verdict.text).toBe(
      'Commande en cours de vérification — ne pas remettre avant la levée du contrôle.',
    );
    expect(verdict.tone).toBe('alert');
    // Sans fiche non plus.
    expect(readyVerdict(held, null).tone).toBe('alert');
  });

  it('une commande retirée malgré une retenue dit qu’elle est partie', () => {
    const gone = { ...held, state: 'handed_over' as const };

    expect(readyVerdict(gone, closedBag).text).toBe('Déjà retirée. Le sac est parti.');
  });

  it('atténue les gestes d’une retenue même sac fermé, et dit pourquoi', () => {
    expect(gestureCaution(held, closedBag)).toContain('contrôle qualité');
    expect(gestureCaution(ENTRY, closedBag)).toBeNull();
    expect(gestureCaution(ENTRY, null)).toContain('colisage');
  });
});

function packingLine(sku: string, over: Partial<PackingLine> = {}): PackingLine {
  return {
    sku,
    productName: sku,
    quantity: 4,
    saleUnit: 'piece',
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    allocated: 0,
    unallocated: 4,
    ...over,
  };
}

/** Les deux coches de chaque ligne (Hugo, 2026-11-03). */
describe('lineMarks', () => {
  it('sans fiche de colis, aucune coche', () => {
    expect(lineMarks(null).size).toBe(0);
  });

  it('le fournil : sorti en succès, en attente en alerte — jamais « en partie »', () => {
    const marks = lineMarks(
      sheet({ lines: [packingLine('A'), packingLine('B', { awaitingProduction: true })] }),
    );

    expect(marks.get('A')?.oven).toBe('success');
    expect(marks.get('B')?.oven).toBe('alert');
    expect(marks.get('B')?.ovenLabel).toBe('Fournil : pas encore sorti');
  });

  it('le colisage : au bac, en partie, rien', () => {
    const marks = lineMarks(
      sheet({
        lines: [
          packingLine('A', { packed: true, allocated: 4, unallocated: 0 }),
          packingLine('B', { allocated: 2, unallocated: 2 }),
          packingLine('C'),
        ],
      }),
    );

    expect([marks.get('A')?.packing, marks.get('B')?.packing, marks.get('C')?.packing]).toEqual([
      'success',
      'warning',
      'alert',
    ]);
    expect(marks.get('B')?.packingLabel).toBe('Colisage : en partie au bac');
  });

  it('le chiffre : « au bac / commandé », puis le commandé seul en succès', () => {
    const marks = lineMarks(
      sheet({
        lines: [
          packingLine('A', { packed: true, allocated: 4, unallocated: 0 }),
          packingLine('B', { allocated: 2, unallocated: 2 }),
          packingLine('C'),
          // Au bac mais encore attendue au four : pas « faite ».
          packingLine('D', { packed: true, allocated: 4, awaitingProduction: true }),
        ],
      }),
    );

    expect(marks.get('A')).toMatchObject({ allocated: null, count: 'success' });
    expect(marks.get('B')).toMatchObject({ allocated: 2, count: 'warning' });
    expect(marks.get('C')).toMatchObject({ allocated: 0, count: 'alert' });
    expect(marks.get('D')).toMatchObject({ allocated: 4, count: 'warning' });
  });
});

/** « au bac / total », puis le total seul en succès (Hugo, 2026-11-03). */
describe('pieceCount', () => {
  it('sans fiche : le total seul, sans ton', () => {
    expect(pieceCount(null, null, 12)).toEqual({ packed: null, total: 12, complete: false });
  });

  it('en cours : au bac / total', () => {
    const open = sheet({ lines: [packingLine('A')], lineCount: 1, packedPieces: 5 });
    expect(pieceCount(open, bagReadiness(open), 12)).toEqual({
      packed: 5,
      total: 12,
      complete: false,
    });
  });

  it('four fini et sac fermé : le total seul, en succès', () => {
    const done = sheet({
      lines: [packingLine('A', { packed: true })],
      lineCount: 1,
      packedLines: 1,
      packedPieces: 12,
      packedAt: '2026-09-28T03:12:00.000Z',
    });
    expect(pieceCount(done, bagReadiness(done), 12)).toEqual({
      packed: null,
      total: 12,
      complete: true,
    });
  });
});
