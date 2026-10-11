import { describe, expect, it } from 'vitest';

import { entryView } from '../shop-copy.testing';
import { matchesSearch } from './copy-search';
import { spaceTree } from './space-tree';

const ENTRIES = [
  entryView('nav.home', 'nav', 'Accueil'),
  entryView('cart.title', 'cart', 'Votre panier', {
    locales: { en: { draftState: 'set', draftText: 'Basket' } },
  }),
  entryView('cart.empty', 'cart', 'Panier vide', { staleTranslations: ['it'] }),
  entryView('hero.title', 'hero', 'Bonjour', { locales: { fr: { publishedText: 'Salut' } } }),
  entryView('mystery.x', 'mystery', 'Inconnu'),
];

const ALL = { matches: (): boolean => true, visibleKeys: null };

describe('spaceTree — l’arbre des espaces', () => {
  it('suit l’ordre du recueil, parcours de commande d’abord, inconnus à la fin', () => {
    expect(spaceTree(ENTRIES, ALL).map((node) => node.space)).toEqual([
      'hero',
      'cart',
      'nav',
      'mystery',
    ]);
  });

  it('compte les pastilles : à publier, en retard, modifié', () => {
    const cart = spaceTree(ENTRIES, ALL).find((node) => node.space === 'cart');
    expect(cart).toMatchObject({ count: 2, pending: 1, stale: 1, modified: 0, journey: true });
    expect(spaceTree(ENTRIES, ALL).find((node) => node.space === 'hero')?.modified).toBe(1);
  });

  it('un espace inconnu de la liste s’affiche sous son identifiant', () => {
    expect(spaceTree(ENTRIES, ALL).at(-1)).toMatchObject({
      space: 'mystery',
      title: 'mystery',
      journey: false,
    });
  });

  it('ne garde que les clés que l’aperçu montre', () => {
    const tree = spaceTree(ENTRIES, { ...ALL, visibleKeys: new Set(['cart.empty']) });
    expect(tree).toEqual([expect.objectContaining({ space: 'cart', count: 1 })]);
  });

  it('cherche dans la langue affichée, sans accents ni casse', () => {
    const tree = spaceTree(ENTRIES, {
      ...ALL,
      matches: (entry) => matchesSearch(entry, 'BASKET', 'en'),
    });
    expect(tree.map((node) => node.space)).toEqual(['cart']);
    expect(matchesSearch(entryView('k', 's', 'Règlement'), 'reglement', 'fr')).toBe(true);
  });
});
