import type { CatalogFamilyView, CatalogItemView } from '@lfd/contracts';

import { catalogShelves } from '../catalog-shelves';
import { toCatalogProduct } from '../to-catalog-product';

// ⚠️ Les prix sont en MILLICENTIMES (10⁻⁵ €) : un croissant à 2,20 € vaut
// 220 000, pas 220. Le champ a été renommé quand le prix unitaire est descendu
// sous le centime ; ces trois valeurs ne l'avaient pas suivi, et le test lisait
// donc « 0,0022 € » — un catalogue divisé par mille. C'est très exactement le
// défaut que la migration se donnait pour mission d'éviter en CONVERTISSANT les
// valeurs plutôt qu'en les réinterprétant ; elle l'a fait en base, pas ici.
// Des familles telles que le référentiel les livre : un id opaque, un nom, une
// position. Aucune n'est connue du code — c'est tout l'objet du rangement.
const VIENNOISERIES: CatalogFamilyView = { id: 'fam-vien', name: 'Viennoiseries', position: 0 };
const PAINS: CatalogFamilyView = { id: 'fam-pains', name: 'Pains', position: 1 };
const CHOCOLAT: CatalogFamilyView = { id: 'fam-choco', name: 'Chocolat & confiserie', position: 4 };

const CROISSANT: CatalogItemView = {
  sku: 'VIE-001',
  name: 'Croissant',
  unitPriceMillicents: 220_000,
  vatRate: 5.5,
  family: VIENNOISERIES,
  category: null,
};

const BAGUETTE: CatalogItemView = {
  sku: 'PAI-001',
  name: 'Baguette tradition',
  unitPriceMillicents: 200_000,
  vatRate: 5.5,
  family: PAINS,
  category: null,
};

const TABLETTE: CatalogItemView = {
  sku: 'CHO-003',
  name: 'Tablette lait',
  unitPriceMillicents: 1_000_000,
  vatRate: 5.5,
  family: CHOCOLAT,
  category: null,
};

describe('catalogShelves', () => {
  it("range dans l'ordre du référentiel, pas dans celui des données", () => {
    // Le chocolat arrive en premier dans l'entrée et doit finir en dernier :
    // c'est la position de la famille qui fixe l'ordre, pas l'appelant.
    const shelves = catalogShelves([TABLETTE, BAGUETTE, CROISSANT], (item) => item.family);

    expect(shelves.map((shelf) => shelf.family?.id)).toEqual([
      'fam-vien',
      'fam-pains',
      'fam-choco',
    ]);
  });

  it('nomme chaque rayon du nom de sa famille', () => {
    const [shelf] = catalogShelves([CROISSANT], (item) => item.family);

    expect(shelf?.label).toBe('Viennoiseries');
  });

  it('range une famille inconnue du code, sans déploiement', () => {
    // Une famille que le référentiel vient de créer : aucun code ne la connaît,
    // elle devient un rayon parce qu'elle porte un article.
    const snacking: CatalogFamilyView = { id: '01a0-neuve', name: 'Snacking', position: 2 };
    const wrap: CatalogItemView = { ...BAGUETTE, sku: 'SNK-001', name: 'Wrap', family: snacking };

    const shelves = catalogShelves([TABLETTE, wrap, CROISSANT], (item) => item.family);

    expect(shelves.map((shelf) => shelf.label)).toEqual([
      'Viennoiseries',
      'Snacking',
      'Chocolat & confiserie',
    ]);
  });

  it('ne crée pas de rayon vide', () => {
    const shelves = catalogShelves([CROISSANT], (item) => item.family);

    expect(shelves).toHaveLength(1);
  });

  /**
   * Régression : le 2026-09-26, un article d'une famille sans rayon a mis le
   * catalogue pro en 500. Servi sans famille, il ne doit pas disparaître de la
   * saisie de commande.
   */
  it('range un article sans famille connue en dernier, sous son propre titre', () => {
    const orphan: CatalogItemView = { ...CROISSANT, sku: 'VIE-099', family: null };

    const shelves = catalogShelves([orphan, TABLETTE], (item) => item.family);

    expect(shelves.map((shelf) => [shelf.family?.id ?? null, shelf.label])).toEqual([
      ['fam-choco', 'Chocolat & confiserie'],
      [null, 'Sans famille connue'],
    ]);
  });

  it("ne rend rien quand il n'y a rien", () => {
    expect(catalogShelves([], (item: CatalogItemView) => item.family)).toEqual([]);
  });
});

describe('toCatalogProduct', () => {
  it('formate le prix du serveur une fois pour toutes', () => {
    // La conversion est le SEUL endroit où les centimes deviennent un libellé.
    // Deux écrans qui formateraient chacun de leur côté finiraient par afficher
    // deux prix pour un même article.
    const product = toCatalogProduct(CROISSANT);

    expect(product.id).toBe('VIE-001');
    expect(product.name).toBe('Croissant');
    // `\s` et non une espace littérale : `Intl` insère une insécable étroite avant
    // le symbole. L'épingler ferait échouer le test sur un caractère invisible,
    // pour une valeur pourtant juste.
    expect(product.price).toMatch(/^2,20\s€$/u);
  });

  it("n'invente ni visuel, ni colisage, ni rupture", () => {
    // Le catalogue serveur ne les porte pas. Les fabriquer ici les rendrait
    // indiscernables de vraies données.
    const product = toCatalogProduct(BAGUETTE);

    expect(product.image).toBeUndefined();
    expect(product.step).toBeUndefined();
    expect(product.outOfStock).toBeUndefined();
  });
});
