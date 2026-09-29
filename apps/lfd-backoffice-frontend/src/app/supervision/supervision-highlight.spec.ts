import { signal } from '@angular/core';
import type { HandoverQueueView, PackingSheet, ProductionPackingView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { SupervisionHighlight } from './supervision-highlight';

function sheet(reference: string, awaited: readonly string[]): PackingSheet {
  const skus = ['PAI', ...awaited];
  return {
    reference,
    orderId: `o-${reference}`,
    containers: 0,
    customerLabel: reference,
    fulfillmentMethod: 'pickup',
    destination: 'Boutique',
    lines: skus.map((sku) => ({
      sku,
      productName: sku,
      quantity: 1,
      packed: false,
      initials: null,
      packedAt: null,
      awaitingProduction: awaited.includes(sku),
    })),
    lineCount: skus.length,
    packedLines: 0,
    remainingLines: skus.length,
    pieces: skus.length,
    packedPieces: 0,
    canDeclareReady: false,
    packedAt: null,
    packedBy: null,
    packedByName: null,
  };
}

const PACKING: ProductionPackingView = {
  date: '2026-09-28',
  closedAt: 'x',
  sheets: [sheet('CMD-1', ['BRI']), sheet('CMD-2', [])],
  resources: [],
  orderCount: 2,
  todoCount: 0,
  readyCount: 0,
  relativeDay: 'today',
};

function highlight(): SupervisionHighlight {
  return new SupervisionHighlight({
    packing: signal(PACKING),
    handover: signal<HandoverQueueView | null>(null),
    preparationBoard: signal(null),
    packingBoard: signal({
      notClosed: false,
      upcoming: [],
      visible: [],
      overflow: 0,
      packed: [],
      toPack: 0,
      awaitingOven: 1,
    }),
    handoverBoard: signal(null),
  });
}

describe('SupervisionHighlight — une source à la fois (Supervision v2, A5)', () => {
  it('rien n’est mis en avant au départ', () => {
    const h = highlight();

    expect(h.active()).toBe(false);
    expect(h.matches().mode).toBeNull();
    expect(h.position()).toBe('0 / 0');
  });

  it('une pastille re-cliquée s’éteint', () => {
    const h = highlight();

    h.toggleFocus('oven');
    expect(h.matches().mode).toBe('products');
    expect([...h.matches().skus]).toEqual(['BRI']);
    h.toggleFocus('oven');
    expect(h.focus()).toBeNull();
  });

  it('la frappe efface pastille et dépliage, et repart du premier résultat', () => {
    const h = highlight();
    h.toggleAwaited('CMD-1');
    h.step(3);

    h.search('cmd-2');

    expect(h.awaitedOpen()).toBeNull();
    expect(h.hitCursor()).toBe(0);
    expect([...h.matches().references]).toEqual(['CMD-2']);
    expect(h.matches().mode).toBe('search');
  });

  it('une pastille efface la recherche ; ✕ efface tout', () => {
    const h = highlight();
    h.search('cmd');

    h.toggleFocus('held');
    expect(h.query()).toBe('');

    h.clear();
    expect(h.focus()).toBeNull();
    expect(h.active()).toBe(false);
  });
});
