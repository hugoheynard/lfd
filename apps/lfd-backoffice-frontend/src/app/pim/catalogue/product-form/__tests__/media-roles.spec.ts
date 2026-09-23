import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore, type MediaSlot } from '../product-form-store';
import type { PickedMedia } from '../../library-picker/library-picker';

/**
 * **Les cinq usages, et l'unicité de ceux qui n'en admettent qu'un.**
 *
 * `hero` et `thumbnail` sont uniques par porteur — le domaine le dit
 * (`SINGLE_ROLES`) et le serveur refuse le second. L'écran ne se contente pas
 * d'éviter ce refus : il rend le doublon **inexprimable**.
 *
 * 🔴 Et il ne doit déloger QUE le porteur du même rôle. `setMainVisual`
 * rendait tous les autres à `gallery`, ce qui était sans conséquence tant
 * qu'aucun écran ne proposait les trois autres usages — et qui aurait effacé
 * une mise en situation dès le lot 5.
 */

function store(): ProductFormStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
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

describe('les usages d’un visuel', () => {
  it('déloge le porteur du MÊME rôle unique, et lui seul', () => {
    const form = store();
    form.media.set([slot('a', 'hero'), slot('b', 'lifestyle'), slot('c')]);

    form.setMediaRole(2, 'hero');

    // `lifestyle` est intact : ce n'est pas le même rôle, et il est pluriel.
    expect(rolesOf(form)).toEqual(['gallery', 'lifestyle', 'hero']);
  });

  it('laisse cohabiter plusieurs visuels d’un rôle PLURIEL', () => {
    const form = store();
    form.media.set([slot('a'), slot('b'), slot('c')]);

    form.setMediaRole(0, 'lifestyle');
    form.setMediaRole(1, 'lifestyle');

    expect(rolesOf(form)).toEqual(['lifestyle', 'lifestyle', 'gallery']);
  });

  it('tient l’unicité de la vignette de rayon comme celle de l’ouverture', () => {
    const form = store();
    form.media.set([slot('a', 'thumbnail'), slot('b')]);

    form.setMediaRole(1, 'thumbnail');

    expect(rolesOf(form)).toEqual(['gallery', 'thumbnail']);
  });

  it('ne recrée pas les entrées qu’il ne change pas', () => {
    const form = store();
    const untouched = slot('a', 'lifestyle');
    form.media.set([untouched, slot('b')]);

    form.setMediaRole(1, 'print');

    expect(form.media()[0]).toBe(untouched);
  });
});

describe('prendre dans la médiathèque', () => {
  /**
   * Une image telle que le PANNEAU la rend. Les faits mesurés en font partie :
   * ils viennent de la bibliothèque, qui les a constatés dans les octets, et
   * les omettre ici ferait passer un doublé pour le contrat qu'il joue.
   */
  function picked(url: string, name = ''): PickedMedia {
    return { url, name, width: 800, height: 600, bytes: 1024, contentType: 'image/png' };
  }

  it('ajoute à la suite, au rôle neutre', () => {
    const form = store();
    form.media.set([slot('a', 'hero')]);

    form.addFromLibrary([picked('b', 'croissant')]);

    expect(form.media()).toEqual([
      { role: 'hero', url: 'a', name: '' },
      { role: 'gallery', url: 'b', name: 'croissant', width: 800, height: 600 },
    ]);
  });

  /**
   * Régression attendue : une même image deux fois sur la même fiche n'a pas de
   * sens, et le serveur refuserait un second `hero`. L'écran ne doit pas
   * laisser produire la situation pour la voir refusée ensuite.
   */
  it('ignore une image que la fiche porte DÉJÀ', () => {
    const form = store();
    form.media.set([slot('a')]);

    form.addFromLibrary([picked('a', 'déjà là'), picked('b')]);

    expect(form.media().map((item) => item.url)).toEqual(['a', 'b']);
  });
});
