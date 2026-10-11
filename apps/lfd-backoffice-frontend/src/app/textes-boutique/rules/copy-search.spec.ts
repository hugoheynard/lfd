import { describe, expect, it } from 'vitest';

import { entryView } from '../shop-copy.testing';
import { matchesSearch } from './copy-search';

const ENTRY = entryView('cart.title', 'cart', 'Votre panier', {
  locales: { en: { original: 'Your basket' } },
});

describe('copy-search — dans la langue affichée', () => {
  it('trouve le texte de la langue affichée, pas celui des autres', () => {
    expect(matchesSearch(ENTRY, 'basket', 'en')).toBe(true);
    expect(matchesSearch(ENTRY, 'basket', 'fr')).toBe(false);
  });

  it('trouve aussi par la clé et par le libellé, sans casse ni accents', () => {
    expect(matchesSearch(ENTRY, 'cart.title', 'fr')).toBe(true);
    expect(matchesSearch(ENTRY, 'titre', 'it')).toBe(true);
  });
});
