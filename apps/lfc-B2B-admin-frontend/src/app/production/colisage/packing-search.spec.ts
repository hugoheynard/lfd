import type { PackingLine, PackingResource, PackingSheet } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import {
  foundOnlyElsewhere,
  hitLinesByOrder,
  matchesTerm,
  normaliseTerm,
  searchHits,
} from './packing-search';

/** Le code feuille de la recherche : ce qu'un terme désigne, sans monter l'écran. */

function line(over: Partial<PackingLine> = {}): PackingLine {
  return {
    sku: 'CRO',
    productName: 'Croissant',
    quantity: 12,
    packed: false,
    initials: null,
    packedAt: null,
    awaitingProduction: false,
    ...over,
  };
}

function sheet(reference: string, lines: readonly PackingLine[]): PackingSheet {
  return {
    reference,
    containers: 0,
    customerLabel: reference,
    fulfillmentMethod: 'delivery',
    destination: 'ici',
    lines,
    lineCount: lines.length,
    packedLines: 0,
    remainingLines: lines.length,
    pieces: 0,
    packedPieces: 0,
    canDeclareReady: false,
    packedAt: null,
    packedBy: null,
    packedByName: null,
  };
}

function resource(sku: string, productName: string): PackingResource {
  return {
    sku,
    productName,
    produced: 0,
    allocated: 0,
    remaining: 0,
    awaitingProduction: false,
    exhausted: true,
  };
}

describe('la recherche du poste de colisage', () => {
  it('ne désigne rien pour un terme vide ou fait d’espaces', () => {
    const sheets = [sheet('CMD-1', [line()])];

    expect(searchHits(normaliseTerm(''), sheets, [])).toEqual(new Set());
    expect(searchHits(normaliseTerm('   '), sheets, [])).toEqual(new Set());
    expect(matchesTerm('', 'CRO', 'Croissant')).toBe(false);
  });

  it('ignore la casse et les accents', () => {
    expect(normaliseTerm('  PÂTE à Choux ')).toBe('pate a choux');
    expect(matchesTerm(normaliseTerm('pate a choux'), 'PAC', 'Pâte à choux')).toBe(true);
  });

  it('trouve par SKU autant que par nom', () => {
    expect(matchesTerm(normaliseTerm('bag'), 'BAG', 'Baguette tradition')).toBe(true);
    expect(matchesTerm(normaliseTerm('tradition'), 'BAG', 'Baguette tradition')).toBe(true);
    expect(matchesTerm(normaliseTerm('seigle'), 'BAG', 'Baguette tradition')).toBe(false);
  });

  it('tire un seul ensemble des lignes ET de la marchandise', () => {
    // Le croissant n'est dans aucune commande, la baguette n'est pas dans la
    // marchandise : les deux sont désignés, parce que les trois colonnes se
    // surlignent ensemble.
    const hits = searchHits(
      normaliseTerm('a'),
      [sheet('CMD-1', [line({ sku: 'BAG', productName: 'Baguette' })])],
      [resource('CRO', 'Croissant')],
    );

    expect(hits).toEqual(new Set(['BAG', 'CRO']));
  });

  it('rend les lignes trouvées par commande, sans les additionner', () => {
    const found = [
      line({ sku: 'PAC', productName: 'Pain au chocolat', quantity: 12 }),
      line({ sku: 'PDM', productName: 'Pain de mie', quantity: 8 }),
    ];
    const byOrder = hitLinesByOrder(new Set(['PAC', 'PDM']), [
      sheet('CMD-1', [...found, line({ sku: 'BAG' })]),
      sheet('CMD-2', [line({ sku: 'BAG' })]),
    ]);

    expect([...byOrder.keys()]).toEqual(['CMD-1']);
    expect(byOrder.get('CMD-1')?.map((l) => l.quantity)).toEqual([12, 8]);
  });

  it('dit « trouvé dans l’autre pile » seulement quand la pile affichée n’a rien', () => {
    const here = sheet('CMD-1', [line({ sku: 'BAG' })]);
    const there = sheet('CMD-9', [line({ sku: 'CRO' })]);
    const found = hitLinesByOrder(new Set(['CRO']), [here, there]);

    expect(foundOnlyElsewhere(found, [here], [there])).toBe(true);
    // Trouvé ici aussi : pas d'avis, la pile affichée le montre déjà.
    expect(foundOnlyElsewhere(found, [there], [here])).toBe(false);
    // Trouvé nulle part : pas cet avis-là non plus.
    expect(foundOnlyElsewhere(new Map(), [here], [there])).toBe(false);
  });
});
