import type { CompanyPricingCategoryView, PricingItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { withPrice } from '../draft-prices';
import { ALL_SHELVES, filterTarifRows, normalizeSearch } from '../tarif-filter';
import { tarifShelves } from '../tarif-shelves';

// Les lignes viennent de `tarifShelves`, comme à l'écran : pas de ligne
// fabriquée à moitié, qui laisserait le filtre lire un champ absent.
function item(sku: string, name: string): PricingItemView {
  return {
    sku,
    name,
    canonicalMillicents: 200_000,
    ownFloor: null,
    volumeTiers: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId: null,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalMillicents: 200_000,
    elasticity: null,
    negotiationRoom: null,
  };
}

function family(
  id: string,
  name: string,
  items: readonly PricingItemView[],
): CompanyPricingCategoryView {
  return { id, name, family: { id, name, position: 1 }, items };
}

const SHELVES = tarifShelves(
  [
    family('vien', 'Viennoiseries', [
      item('CRO-01', 'Croissant'),
      item('PAC-01', 'Pain au chocolat'),
    ]),
    family('pat', 'Pâtisseries', [item('ECL-01', 'Éclair café'), item('TAR-01', 'Tarte citron')]),
  ],
  withPrice(withPrice(new Map(), 'CRO-01', '1,10'), 'TAR-01', '3'),
);
const ALL = { shelfId: ALL_SHELVES, search: '', pricedOnly: false };

describe('filterTarifRows', () => {
  it("garde tout en « Toutes », dans l'ordre du catalogue, avec la famille", () => {
    const rows = filterTarifRows(SHELVES, ALL);
    expect(rows.map((r) => r.sku)).toEqual(['CRO-01', 'PAC-01', 'ECL-01', 'TAR-01']);
    expect(rows[2]?.shelfName).toBe('Pâtisseries');
  });

  it('ne garde que la famille choisie', () => {
    expect(filterTarifRows(SHELVES, { ...ALL, shelfId: 'pat' }).map((r) => r.sku)).toEqual([
      'ECL-01',
      'TAR-01',
    ]);
  });

  it('cherche par nom sans casse ni accents, et par SKU', () => {
    expect(filterTarifRows(SHELVES, { ...ALL, search: 'ECLAIR' }).map((r) => r.sku)).toEqual([
      'ECL-01',
    ]);
    expect(filterTarifRows(SHELVES, { ...ALL, search: 'tar-0' }).map((r) => r.sku)).toEqual([
      'TAR-01',
    ]);
  });

  it('ne garde que les prix fermes saisis', () => {
    expect(filterTarifRows(SHELVES, { ...ALL, pricedOnly: true }).map((r) => r.sku)).toEqual([
      'CRO-01',
      'TAR-01',
    ]);
  });

  it('combine les trois filtres', () => {
    expect(filterTarifRows(SHELVES, { shelfId: 'vien', search: 'pain', pricedOnly: true })).toEqual(
      [],
    );
  });
});

describe('normalizeSearch', () => {
  it('retire casse, accents et blancs de bord', () => {
    expect(normalizeSearch('  Pâté Éclair ')).toBe('pate eclair');
  });
});
