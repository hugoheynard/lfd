import type { CatalogFamilyView } from '@lfd/contracts';

import { arrangedShelf, catalogRootShelves, sectionIntertitles } from '../catalog-root-shelves';
import { UNKNOWN_FAMILY_LABEL } from '../catalog-shelves';

/** Le rangement par catégorie racine (Hugo, 2026-10-30). */
const VIEN = { id: 'fam-vien', name: 'Viennoiserie', position: 1 };
const PAINS: CatalogFamilyView = { id: 'fam-pain', name: 'Pains', position: 0 };
const FINE: CatalogFamilyView = {
  id: 'fam-fine',
  name: 'Viennoiserie fine',
  position: 3,
  root: VIEN,
};
const BRIOCHE: CatalogFamilyView = { id: 'fam-brio', name: 'Brioches', position: 2, root: VIEN };

interface Item {
  readonly sku: string;
  readonly family: CatalogFamilyView | null;
}

const ITEMS: readonly Item[] = [
  { sku: 'FIN-1', family: FINE },
  { sku: 'PAI-1', family: PAINS },
  { sku: 'VIE-1', family: { ...VIEN, root: VIEN } },
  { sku: 'BRI-1', family: BRIOCHE },
];

describe('catalogRootShelves', () => {
  it('une sous-catégorie tombe dans le rayon de sa racine, racines par position', () => {
    const shelves = catalogRootShelves(ITEMS, (item) => item.family);

    expect(shelves.map((shelf) => shelf.label)).toEqual(['Pains', 'Viennoiserie']);
    expect(shelves[1]?.items.map((item) => item.sku)).toEqual(['FIN-1', 'VIE-1', 'BRI-1']);
  });

  it('range les sous-catégories : la racine en tête, puis position puis nom', () => {
    const [, vien] = catalogRootShelves(ITEMS, (item) => item.family);

    expect(vien?.sections.map((section) => section.family?.name ?? null)).toEqual([
      null,
      'Brioches',
      'Viennoiserie fine',
    ]);
  });

  it('un article sans famille ferme la marche sous son propre titre', () => {
    const shelves = catalogRootShelves(
      [{ sku: 'X', family: null }, ...ITEMS],
      (item) => item.family,
    );

    expect(shelves.at(-1)).toMatchObject({ root: null, label: UNKNOWN_FAMILY_LABEL });
  });

  it('une famille servie sans racine est sa propre racine', () => {
    const [shelf] = catalogRootShelves([{ sku: 'P', family: PAINS }], (item) => item.family);

    expect(shelf?.root).toEqual({ id: 'fam-pain', name: 'Pains', position: 0 });
  });
});

describe('sectionIntertitles', () => {
  it('ouvre un intertitre à chaque changement de sous-catégorie, jamais pour la racine', () => {
    const sections = new Map([
      ['VIE-1', { key: null, label: null }],
      ['BRI-1', { key: 'fam-brio', label: 'Brioches' }],
      ['BRI-2', { key: 'fam-brio', label: 'Brioches' }],
      ['FIN-1', { key: 'fam-fine', label: 'Viennoiserie fine' }],
    ]);
    const lines = ['VIE-1', 'BRI-1', 'BRI-2', 'FIN-1'].map((sku) => ({ sku }));

    expect([...sectionIntertitles(lines, (line) => sections.get(line.sku))]).toEqual([
      ['BRI-1', 'Brioches'],
      ['FIN-1', 'Viennoiserie fine'],
    ]);
  });
});

describe('arrangedShelf', () => {
  const bySku = (a: Item, b: Item): number => a.sku.localeCompare(b.sku);
  const [, vien] = catalogRootShelves(ITEMS, (item) => item.family);

  it('réglage éteint : un seul tri sur tout le rayon, aucun intertitre', () => {
    const { lines, intertitles } = arrangedShelf(vien?.sections ?? [], bySku, false);

    expect(lines.map((line) => line.sku)).toEqual(['BRI-1', 'FIN-1', 'VIE-1']);
    expect(intertitles.size).toBe(0);
  });

  it('réglage posé : section par section, un intertitre par sous-catégorie', () => {
    const { lines, intertitles } = arrangedShelf(vien?.sections ?? [], bySku, true);

    expect(lines.map((line) => line.sku)).toEqual(['VIE-1', 'BRI-1', 'FIN-1']);
    expect([...intertitles]).toEqual([
      ['BRI-1', 'Brioches'],
      ['FIN-1', 'Viennoiserie fine'],
    ]);
  });
});
