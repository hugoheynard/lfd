import type {
  HandoverQueueEntryView,
  HandoverQueueView,
  PackingLine,
  PackingSheet,
  ProductionPackingView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NO_MATCHES, supervisionMatches } from './supervision-search';

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
