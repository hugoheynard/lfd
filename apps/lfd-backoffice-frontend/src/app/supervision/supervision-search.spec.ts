import type {
  HandoverQueueEntryView,
  HandoverQueueView,
  PackingLine,
  PackingSheet,
  ProductionPackingView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { groupOf, handoverBoard } from './handover-slots';
import type { HandoverBoard, SlotRow } from './handover-slots';
import {
  awaitedMatches,
  lateSkusOf,
  focusMatches,
  NO_MATCHES,
  supervisionMatches,
} from './supervision-search';

function line(sku: string): PackingLine {
  return {
    sku,
    productName: sku,
    quantity: 1,
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
  };
}

function sheet(reference: string, customerLabel: string, skus: readonly string[]): PackingSheet {
  return {
    reference,
    orderId: `o-${reference}`,
    containers: 0,
    customerLabel,
    fulfillmentMethod: 'pickup',
    destination: 'Boutique',
    lines: skus.map(line),
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

function packing(sheets: readonly PackingSheet[]): ProductionPackingView {
  return {
    date: '2026-09-28',
    closedAt: 'x',
    sheets,
    resources: [],
    orderCount: sheets.length,
    todoCount: 0,
    readyCount: 0,
    relativeDay: 'today',
  };
}

function entry(
  reference: string,
  customerLabel: string,
  tradeName: string | null,
): HandoverQueueEntryView {
  return {
    orderId: `o-${reference}`,
    reference,
    customerLabel,
    tradeName,
    clientele: 'pro',
    pickupLabel: 'Boutique',
    fulfillmentMethod: 'pickup',
    window: null,
    totalUnits: 1,
    placedAt: 'x',
    state: 'expected',
    handedOverAt: null,
    handedOverVia: null,
    readyAt: null,
    heldForQuality: false,
  };
}

const QUEUE: HandoverQueueView = {
  day: '2026-09-28',
  entries: [
    entry('CMD-101', 'SARL Marín et fils', 'Le Fournil du Lac'),
    entry('CMD-102', 'Café Central', null),
  ],
};
const PACKING = packing([
  sheet('CMD-101', 'SARL Marín et fils', ['VIE-001', 'PAI-001']),
  sheet('CMD-102', 'Café Central', ['VIE-002']),
]);

describe('supervisionMatches', () => {
  it('ne désigne rien sans terme', () => {
    expect(supervisionMatches('  ', QUEUE, PACKING)).toBe(NO_MATCHES);
  });

  it.each([
    ['le numéro de commande', 'cmd-101'],
    ['l’enseigne', 'fournil du lac'],
    ['la raison sociale, sans accent', 'marin et fils'],
  ])('trouve par %s', (_label, query) => {
    const matches = supervisionMatches(query, QUEUE, PACKING);

    expect([...matches.references]).toEqual(['CMD-101']);
  });

  it('désigne les produits des commandes trouvées, pour la préparation', () => {
    const matches = supervisionMatches('fournil', QUEUE, PACKING);

    expect([...matches.skus].sort()).toEqual(['PAI-001', 'VIE-001']);
  });

  it('trouve au colisage seul quand la file de retrait n’a pas pu être lue', () => {
    expect([...supervisionMatches('central', null, PACKING).references]).toEqual(['CMD-102']);
  });
});

/** Une fiche dont les lignes `awaited` attendent encore le four. */
function waiting(reference: string, customer: string, awaited: readonly string[]): PackingSheet {
  const base = sheet(reference, customer, ['PAI-001', ...awaited]);
  return {
    ...base,
    lines: base.lines.map((l) => ({ ...l, awaitingProduction: awaited.includes(l.sku) })),
  };
}

describe('focusMatches — Supervision v2, A5', () => {
  const OVEN = packing([
    waiting('CMD-101', 'SARL Marín et fils', ['BRI-001']),
    waiting('CMD-102', 'Café Central', ['BRI-001', 'ECL-001']),
    sheet('CMD-103', 'Traiteur', ['VIE-001']),
  ]);

  it('la pastille du four suit les produits attendus, et nomme qui les attend', () => {
    const matches = focusMatches('oven', OVEN, QUEUE, null);

    expect(matches.mode).toBe('products');
    expect([...matches.references].sort()).toEqual(['CMD-101', 'CMD-102']);
    expect([...matches.skus].sort()).toEqual(['BRI-001', 'ECL-001']);
    // L'enseigne quand la file la connaît, la raison sociale sinon.
    expect(matches.awaitedBy.get('BRI-001')).toEqual(['Le Fournil du Lac', 'Café Central']);
  });

  it('une commande dépliée ne suit que ses propres produits', () => {
    const matches = awaitedMatches('CMD-101', OVEN, QUEUE);

    expect([...matches.references]).toEqual(['CMD-101']);
    expect([...matches.skus]).toEqual(['BRI-001']);
    expect(awaitedMatches('INCONNUE', OVEN, QUEUE)).toBe(NO_MATCHES);
  });

  it('une pastille du retrait désigne les commandes de sa cause, en contour', () => {
    const held: HandoverQueueView = {
      ...QUEUE,
      entries: QUEUE.entries.map((e, i) => ({ ...e, heldForQuality: i === 1 })),
    };
    const matches = focusMatches('held', null, held, handoverBoard(held, null));

    expect(matches.mode).toBe('search');
    expect([...matches.references]).toEqual(['CMD-102']);
    expect(matches.skus.size).toBe(0);
  });
});

describe('lateSkusOf', () => {
  const late = (reference: string, cause: SlotRow['overdueCause']): SlotRow => ({
    orderId: `o-${reference}`,
    reference,
    customerLabel: reference,
    state: 'overdue',
    time: '5 h 30',
    totalUnits: 1,
    pickupLabel: 'Le Labo',
    handedOverAt: null,
    readyAt: null,
    overdueMinutes: 40,
    overdueCause: cause,
    method: 'pickup',
    heldForQuality: false,
  });
  const board = (rows: readonly SlotRow[]): HandoverBoard => ({
    pickup: [groupOf('h05', rows)],
    delivery: [],
    pickupExpected: rows.length,
    deliveryExpected: 0,
    overdue: rows.length,
    overdueKitchen: 0,
    awaitingPacking: 0,
    held: 0,
  });

  /** Hugo, 2026-09-28 : bord rouge sur ce dont l'absence a mis un retrait dans le rouge. */
  it('ne garde que les produits attendus par un créneau dépassé PAR NOUS', () => {
    const view = packing([
      waiting('CMD-1', 'Refuge', ['cro']),
      waiting('CMD-2', 'Chalet', ['pac']),
    ]);

    const skus = lateSkusOf(view, board([late('CMD-1', 'kitchen'), late('CMD-2', 'customer')]));

    expect([...skus]).toEqual(['cro']);
    expect(lateSkusOf(view, null).size).toBe(0);
  });
});
