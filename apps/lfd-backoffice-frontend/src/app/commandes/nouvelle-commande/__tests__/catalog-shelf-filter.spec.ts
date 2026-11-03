import { describe, expect, it } from 'vitest';
import type { CatalogFamilyView, CatalogItemView } from '@lfd/contracts';
import { shelfTreeOf } from '@lfd/b2b-ui/catalog';

import {
  ALL_FAMILIES,
  familyShelvesOf,
  inChosenShelf,
  UNKNOWN_FAMILY_SHELF,
} from '../catalog-shelf-filter';

const SUCRE = { id: 'fam-sucre', name: 'Sucré', position: 1 };
const PATIS = { id: 'fam-patis', name: 'Pâtisseries', position: 2 };

const item = (sku: string, family: CatalogFamilyView | null): CatalogItemView => ({
  sku,
  name: `Produit ${sku}`,
  unitPriceMillicents: 200_000,
  vatRate: 5.5,
  family,
  category: null,
});

/** Entremets › Pâtisseries › Sucré : « Sucré » n'a aucun article à lui. */
const ENTREMETS = item('ENT-1', {
  id: 'fam-ent',
  name: 'Entremets',
  position: 3,
  ancestors: [PATIS, SUCRE],
});
const TARTE = item('TAR-1', {
  id: 'fam-tar',
  name: 'Tartes',
  position: 0,
  ancestors: [PATIS, SUCRE],
});
const PAIN = item('PAI-1', { id: 'fam-pain', name: 'Pains', position: 0 });
const ORPHAN = item('ORP-1', null);

describe('familyShelvesOf', () => {
  it('range les familles en arbre, parentes sans article comprises, « Tout » en tête', () => {
    const { entries } = familyShelvesOf([ENTREMETS, TARTE, PAIN], 'Tout', 'Sans famille');

    expect(entries).toEqual([
      { id: ALL_FAMILIES, label: 'Tout' },
      { id: 'fam-pain', label: 'Pains', parentId: null },
      { id: 'fam-tar', label: 'Tartes', parentId: 'fam-patis' },
      { id: 'fam-sucre', label: 'Sucré', parentId: null },
      { id: 'fam-patis', label: 'Pâtisseries', parentId: 'fam-sucre' },
      { id: 'fam-ent', label: 'Entremets', parentId: 'fam-patis' },
    ]);
  });

  it('ferme la marche par les articles sans famille connue', () => {
    const { entries, families } = familyShelvesOf([PAIN, ORPHAN], 'Tout', 'Sans famille');

    expect(entries.at(-1)).toEqual({ id: UNKNOWN_FAMILY_SHELF, label: 'Sans famille' });
    expect([...families]).toEqual(['fam-pain', UNKNOWN_FAMILY_SHELF]);
  });

  it('reste à plat quand aucune famille n’a de parente', () => {
    const { entries } = familyShelvesOf([PAIN], 'Tout', 'Sans famille');

    expect(shelfTreeOf(entries).nested).toBe(false);
  });
});

describe('inChosenShelf', () => {
  const items = [ENTREMETS, TARTE, PAIN, ORPHAN];
  const tree = shelfTreeOf(familyShelvesOf(items, 'Tout', 'Sans famille').entries);
  const under = (chosen: string): string[] =>
    items.filter((entry) => inChosenShelf(tree, entry, chosen)).map((entry) => entry.sku);

  it('« Tout » montre tout', () => {
    expect(under(ALL_FAMILIES)).toEqual(['ENT-1', 'TAR-1', 'PAI-1', 'ORP-1']);
  });

  it('une parente montre son sous-arbre entier, même sans article à elle', () => {
    expect(under('fam-sucre')).toEqual(['ENT-1', 'TAR-1']);
    expect(under('fam-patis')).toEqual(['ENT-1', 'TAR-1']);
  });

  it('une feuille ne montre qu’elle-même', () => {
    expect(under('fam-ent')).toEqual(['ENT-1']);
    expect(under(UNKNOWN_FAMILY_SHELF)).toEqual(['ORP-1']);
  });
});
