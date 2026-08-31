import type { CatalogItemView } from '@lfd/contracts';

import { catalogShelves } from '../catalog-shelves';
import { toCatalogProduct } from '../to-catalog-product';

// ⚠️ Les prix sont en MILLICENTIMES (10⁻⁵ €) : un croissant à 2,20 € vaut
// 220 000, pas 220. Le champ a été renommé quand le prix unitaire est descendu
// sous le centime ; ces trois valeurs ne l'avaient pas suivi, et le test lisait
// donc « 0,0022 € » — un catalogue divisé par mille. C'est très exactement le
// défaut que la migration se donnait pour mission d'éviter en CONVERTISSANT les
// valeurs plutôt qu'en les réinterprétant ; elle l'a fait en base, pas ici.
const CROISSANT: CatalogItemView = {
  sku: 'VIE-001',
  name: 'Croissant',
  unitPriceMillicents: 220_000,
  vatRate: 5.5,
  category: 'viennoiserie',
};

const BAGUETTE: CatalogItemView = {
  sku: 'PAI-001',
  name: 'Baguette tradition',
  unitPriceMillicents: 200_000,
  vatRate: 5.5,
  category: 'pain',
};

const TABLETTE: CatalogItemView = {
  sku: 'CHO-003',
  name: 'Tablette lait',
  unitPriceMillicents: 1_000_000,
  vatRate: 5.5,
  category: 'chocolat',
};

describe('catalogShelves', () => {
  it("range dans l'ordre de la vitrine, pas dans celui des données", () => {
    // Le chocolat arrive en premier dans l'entrée et doit finir en dernier :
    // c'est le contrat qui fixe l'ordre des rayons, pas l'appelant.
    const shelves = catalogShelves([TABLETTE, BAGUETTE, CROISSANT], (item) => item.category);

    expect(shelves.map((shelf) => shelf.category)).toEqual(['viennoiserie', 'pain', 'chocolat']);
  });

  it('nomme chaque rayon avec le libellé du contrat', () => {
    const [shelf] = catalogShelves([CROISSANT], (item) => item.category);

    expect(shelf?.label).toBe('Viennoiseries');
  });

  it('fait disparaître un rayon vide', () => {
    // Après une recherche, un en-tête sans article laisse croire que le filtre a
    // échoué alors qu'il a simplement tout écarté.
    const shelves = catalogShelves([CROISSANT], (item) => item.category);

    expect(shelves).toHaveLength(1);
  });

  it("ne rend rien quand il n'y a rien", () => {
    expect(catalogShelves([], (item: CatalogItemView) => item.category)).toEqual([]);
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
