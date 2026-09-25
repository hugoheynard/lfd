import { describe, expect, it } from 'vitest';

import type {
  HandoverQueueEntryView,
  HandoverQueueView,
  PackingLine,
  PackingSheet,
  ProductionPackingView,
} from '@lfd/contracts';

import { PACKING_VISIBLE_MAX, packingBoard, packingStateOf } from './packing-cards';

function packingLine(overrides: Partial<PackingLine> = {}): PackingLine {
  return {
    sku: 'sku',
    productName: 'Croissant',
    quantity: 12,
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    ...overrides,
  };
}

function sheet(reference: string, overrides: Partial<PackingSheet> = {}): PackingSheet {
  return {
    reference,
    containers: 0,
    customerLabel: `Client ${reference}`,
    fulfillmentMethod: 'pickup',
    destination: 'Boutique',
    lines: [packingLine()],
    lineCount: 1,
    packedLines: 0,
    remainingLines: 1,
    pieces: 12,
    packedPieces: 0,
    canDeclareReady: false,
    packedAt: null,
    packedBy: null,
    packedByName: null,
    ...overrides,
  };
}

function packing(
  sheets: readonly PackingSheet[],
  closedAt: string | null = 'x',
): ProductionPackingView {
  return {
    date: '2026-09-25',
    closedAt,
    sheets,
    resources: [],
    orderCount: sheets.length,
    todoCount: 0,
    readyCount: 0,
    relativeDay: 'today',
  };
}

function entry(reference: string, start: string | null, end = '09:00'): HandoverQueueEntryView {
  return {
    orderId: `o-${reference}`,
    reference,
    customerLabel: reference,
    tradeName: null,
    clientele: 'pro',
    pickupLabel: 'Boutique',
    fulfillmentMethod: 'pickup',
    window: { start, end, source: 'override' },
    totalUnits: 12,
    placedAt: 'x',
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
  };
}

function queue(entries: readonly HandoverQueueEntryView[]): HandoverQueueView {
  return { day: '2026-09-25', entries };
}

describe('la colonne Colisage', () => {
  it('lit l’état d’un bac : colisé, attend le four, en cours, à coliser', () => {
    expect(packingStateOf(sheet('A', { packedAt: 'x', packedLines: 1 }))).toBe('packed');
    expect(packingStateOf(sheet('B', { lines: [packingLine({ awaitingProduction: true })] }))).toBe(
      'awaiting_oven',
    );
    expect(packingStateOf(sheet('C', { packedLines: 1 }))).toBe('in_progress');
    expect(packingStateOf(sheet('D'))).toBe('to_pack');
  });

  it('lit « attend le four » tel quel, même sur un bac déjà entamé, et nomme les produits', () => {
    const board = packingBoard(
      packing([
        sheet('B', {
          packedLines: 1,
          lines: [
            packingLine({ packed: true }),
            packingLine({ productName: 'Éclair', awaitingProduction: true }),
          ],
        }),
      ]),
      null,
    );

    expect(board.visible[0]?.state).toBe('awaiting_oven');
    expect(board.visible[0]?.awaited).toEqual(['Éclair']);
    expect(board.awaitingOven).toBe(1);
  });

  it('trie par heure de retrait jointe par référence, et met en fin ce que la file ignore', () => {
    const board = packingBoard(
      packing([sheet('SANS'), sheet('TARD'), sheet('TOT')]),
      queue([entry('TARD', '09:00'), entry('TOT', null, '07:30')]),
    );

    expect(board.visible.map((card) => card.reference)).toEqual(['TOT', 'TARD', 'SANS']);
  });

  it('montre attend le four et en cours avant ce qui est à coliser', () => {
    const board = packingBoard(
      packing([sheet('A'), sheet('C', { packedLines: 1 })]),
      queue([entry('A', '06:00'), entry('C', '10:00')]),
    );

    expect(board.visible.map((card) => card.reference)).toEqual(['C', 'A']);
  });

  it('replie les colisées et compte au-delà de dix', () => {
    const open = Array.from({ length: PACKING_VISIBLE_MAX + 3 }, (_, i) => sheet(`R${String(i)}`));
    const board = packingBoard(packing([...open, sheet('FERME', { packedAt: 'x' })]), null);

    expect(board.visible).toHaveLength(PACKING_VISIBLE_MAX);
    expect(board.overflow).toBe(3);
    expect(board.packed.map((card) => card.reference)).toEqual(['FERME']);
    expect(board.toPack).toBe(PACKING_VISIBLE_MAX + 3);
  });

  it('dit que la journée n’est pas arrêtée', () => {
    expect(packingBoard(packing([], null), null).notClosed).toBe(true);
  });
});
