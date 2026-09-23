import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TagPaletteStore } from './tag-palette';

/**
 * Ce que ces cas tiennent : **la bande montre ce qui va être écrit**, et le
 * vocabulaire est dérivé de l'usage plutôt que stocké à part.
 *
 * Un écran qui accepte « Croissant » puis affiche « croissant » après le
 * serveur donne l'impression de corriger en douce ; et un second endroit où le
 * vocabulaire vivrait finirait par diverger de ce que les images portent.
 */

function palette(): TagPaletteStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [TagPaletteStore] });
  return TestBed.inject(TagPaletteStore);
}

describe('la bande de tags', () => {
  it('normalise à la saisie, comme le fera le serveur', () => {
    const band = palette();

    expect(band.draft('  Croissant ')).toBe('croissant');
    expect(band.all()).toEqual(['croissant']);
  });

  it('refuse une saisie vide sans rien ajouter', () => {
    const band = palette();

    expect(band.draft('   ')).toBeNull();
    expect(band.all()).toEqual([]);
  });

  it('dérive le vocabulaire de ce que les images portent', () => {
    const band = palette();

    band.observe([['beurre', 'croissant'], ['croissant'], []]);

    expect(band.all()).toEqual(['beurre', 'croissant']);
  });

  it('ne double pas un mot déjà porté par une image', () => {
    const band = palette();
    band.observe([['croissant']]);

    band.draft('Croissant');

    expect(band.all()).toEqual(['croissant']);
  });

  /**
   * La recherche cherche N'IMPORTE OÙ dans le mot : savoir comment un tag
   * commence est précisément ce qu'on ne sait pas quand on le cherche.
   */
  it('trouve un mot par son milieu', () => {
    const band = palette();
    band.observe([['croissant', 'beurre', 'chocolat']]);

    band.search.set('SANT');

    expect(band.shown()).toEqual(['croissant']);
  });

  it('arme le mot qu’on vient d’écrire, pour qu’il serve tout de suite', () => {
    const band = palette();

    band.draft('croissant');

    expect(band.armed()).toBe('croissant');
  });

  it('désarme au second clic, pour qu’un clic sur une image n’écrive plus', () => {
    const band = palette();
    band.observe([['croissant']]);

    band.toggle('croissant');
    band.toggle('croissant');

    expect(band.armed()).toBeNull();
  });

  /**
   * Régression attendue : `observe` réécrit l'usage à chaque relecture. Il ne
   * doit pas emporter un mot écrit dans la bande et pas encore posé — sinon il
   * disparaît sous les doigts au premier chargement de page suivante.
   */
  it('ne perd pas un mot écrit mais pas encore posé', () => {
    const band = palette();
    band.draft('nouveau');

    band.observe([['croissant']]);

    expect(band.all()).toEqual(['croissant', 'nouveau']);
  });
});
