import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore, type MediaSlot } from '../product-form-store';

/**
 * **Le visuel principal — un seul par fiche, garanti par le GESTE.**
 *
 * La vitrine du canal B2B cherche le `hero` et refuse délibérément de se
 * rabattre sur le premier visuel : « afficher une photo de table à la place
 * d'un croissant serait pire que le vide ». Elle attend donc une désignation.
 *
 * 🔴 Jusqu'au 2026-09-23, aucun écran ne pouvait la faire — tout dépôt naissait
 * `gallery` — donc aucun produit n'a jamais porté de `hero`, donc la vitrine
 * n'a jamais montré la moindre image. Ces cas tiennent le geste qui manquait,
 * et surtout son unicité : deux principaux doivent être INEXPRIMABLES, pas
 * interdits.
 */

function store(): ProductFormStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    // `ProductFormStore` vit avec la page, pas à la racine : le harnais doit
    // donc le fournir comme le composant le ferait.
    providers: [provideHttpClient(), provideHttpClientTesting(), ProductFormStore],
  });
  return TestBed.inject(ProductFormStore);
}

function slot(url: string, role = 'gallery'): MediaSlot {
  return { role, url, name: '' };
}

function rolesOf(form: ProductFormStore): readonly string[] {
  return form.media().map((item) => item.role);
}

describe('le visuel principal', () => {
  it('désigne, et rend les AUTRES à la galerie', () => {
    const form = store();
    form.media.set([slot('a'), slot('b'), slot('c')]);

    form.setMainVisual(1, true);

    expect(rolesOf(form)).toEqual(['gallery', 'hero', 'gallery']);
  });

  /**
   * Le cœur du fichier : l'unicité n'est pas une règle qu'on vérifie après
   * coup, c'est une propriété du verbe. Désigner le second DOIT rendre le
   * premier à la galerie, en une seule mise à jour.
   */
  it('ne laisse jamais deux principaux, même en changeant d’avis', () => {
    const form = store();
    form.media.set([slot('a'), slot('b'), slot('c')]);

    form.setMainVisual(0, true);
    form.setMainVisual(2, true);

    expect(rolesOf(form)).toEqual(['gallery', 'gallery', 'hero']);
    expect(rolesOf(form).filter((role) => role === 'hero')).toHaveLength(1);
  });

  it('retire la désignation sans en donner une autre', () => {
    const form = store();
    form.media.set([slot('a', 'hero'), slot('b')]);

    form.setMainVisual(0, false);

    // N'en désigner AUCUN est légal — c'est l'état de toutes les fiches jusqu'au
    // 2026-09-23. La vitrine ne montre alors rien, ce qu'elle préfère à montrer
    // n'importe laquelle.
    expect(rolesOf(form)).toEqual(['gallery', 'gallery']);
    expect(form.mainVisualIndex()).toBe(-1);
  });

  it('dit quel rang porte la désignation', () => {
    const form = store();
    form.media.set([slot('a'), slot('b', 'hero')]);

    expect(form.mainVisualIndex()).toBe(1);
  });

  /**
   * Régression : reconstruire tous les objets ferait repartir les `track` de la
   * galerie et clignoter les aperçus à chaque désignation.
   */
  it('ne recrée pas les entrées qu’il ne change pas', () => {
    const form = store();
    const untouched = slot('a');
    form.media.set([untouched, slot('b')]);

    form.setMainVisual(1, true);

    expect(form.media()[0]).toBe(untouched);
  });
});
