import { TestBed } from '@angular/core/testing';

import { FR } from '../copy/fr';
import { ALL_SHELVES, SHOP_CATEGORIES, SHOP_PRODUCTS } from './mock-shop';
import { Shop } from './shop.service';
import { ShopStore } from './shop.store';

describe('Shop — ce que la boutique montre', () => {
  let shop: Shop;
  let store: ShopStore;

  const shown = (): string[] => shop.products().map((p) => p.id);

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ShopStore, Shop] });
    store = TestBed.inject(ShopStore);
    shop = TestBed.inject(Shop);
  });

  it('ouvre sur tout le catalogue, sans filtre', () => {
    expect(shown()).toHaveLength(SHOP_PRODUCTS.length);
    expect(shop.heading()).toBe(FR.shop.allShelvesTitle);
    expect(shop.activeShelf()).toBe(ALL_SHELVES);
  });

  it('un rayon ne montre que ses pièces', () => {
    const shelf = SHOP_CATEGORIES[0];
    shop.browse(shelf?.id ?? '');

    expect(shop.products().every((p) => p.category === shelf?.id)).toBe(true);
    expect(shop.heading()).toBe(shelf?.shelf);
  });

  /**
   * 🔴 La recherche TRAVERSE les rayons : le client ne sait pas où on a rangé
   * quoi. Un rayon qui resterait filtré pendant une recherche cacherait la
   * moitié des réponses.
   */
  it('la recherche ignore le rayon choisi, et traverse tout le catalogue', () => {
    shop.browse(SHOP_CATEGORIES[0]?.id ?? '');
    store.query.set('pain');

    const names = shop.products().map((p) => p.name);
    expect(names.some((n) => n.includes('Pain de campagne'))).toBe(true);
    expect(names.some((n) => n.includes('Pain au chocolat'))).toBe(true);
  });

  it('ignore accents et casse — « ECLAIR » trouve « éclair »', () => {
    store.query.set('ECLAIR');
    const brut = shown();

    store.query.set('éclair');
    expect(shown()).toEqual(brut);
    expect(brut).toHaveLength(1);
  });

  it('cherche aussi dans la note, pas seulement dans le nom', () => {
    const withNote = SHOP_PRODUCTS.find((p) => p.note.trim() !== '');
    store.query.set(withNote?.note.split(' ')[0] ?? '');

    expect(shown()).toContain(withNote?.id);
  });

  it('rend une liste vide plutôt que tout le rayon quand rien ne répond', () => {
    store.query.set('zzzzz');

    expect(shown()).toEqual([]);
  });

  /**
   * 🔴 **Une seule des deux questions gagne.** Choisir un rayon OUBLIE le terme
   * — pas seulement le filtre. Le laisser dans le champ au-dessus d'une grille
   * qui ne l'honore plus donne un écran dont on ne sait pas dire ce qu'il
   * montre.
   */
  it('choisir un rayon oublie le terme cherché', () => {
    store.query.set('eclair');
    shop.browse(SHOP_CATEGORIES[1]?.id ?? '');

    expect(store.query()).toBe('');
    expect(shop.heading()).toBe(SHOP_CATEGORIES[1]?.shelf);
  });

  it('n’allume aucune pastille pendant une recherche', () => {
    shop.browse(SHOP_CATEGORIES[0]?.id ?? '');
    expect(shop.activeShelf()).toBe(SHOP_CATEGORIES[0]?.id);

    store.query.set('pain');

    expect(shop.activeShelf()).toBeNull();
  });

  it('titre la grille du terme cherché, pour dire ce qu’elle montre', () => {
    store.query.set('pain');

    expect(shop.heading()).toContain('pain');
  });

  /**
   * 🔴 Régression : « chercher quelque chose » se définissait TROIS fois, et
   * l'une des trois ne rognait pas. Trois espaces éteignaient donc toutes les
   * pastilles au-dessus d'une grille qui montrait toujours son rayon — visible
   * seulement une fois les trois réunies dans la même classe.
   */
  it('ne prend pas des espaces pour une recherche, nulle part', () => {
    const shelf = SHOP_CATEGORIES[0];
    shop.browse(shelf?.id ?? '');
    store.query.set('   ');

    expect(shop.heading()).toBe(shelf?.shelf);
    expect(shop.products().every((p) => p.category === shelf?.id)).toBe(true);
    // Et le rail reste allumé : la grille n'a pas changé, le rail non plus.
    expect(shop.activeShelf()).toBe(shelf?.id);
  });
});
