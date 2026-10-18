import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ProductFormStore, type MediaSlot } from '../product-form-store';
import type { PickedMedia } from '../../library-picker/library-picker';

/**
 * **Les usages d'une image, et l'unicité de ceux qui n'en admettent qu'un.**
 *
 * Depuis le 2026-10-18, une image porte plusieurs usages (décision de Hugo).
 * `hero` et `thumbnail` restent uniques par fiche — le domaine le dit
 * (`SINGLE_ROLES`) et le serveur refuse le second. L'écran rend le doublon
 * **inexprimable** : cocher l'un le retire de l'image qui le portait.
 *
 * 🔴 Ces cas remplacent ceux de `setMainVisual` / `setMediaRole`, retirés le
 * même jour : ils supposaient un usage par image.
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

function pairs(form: ProductFormStore): readonly string[] {
  return form.media().map((item) => `${item.url}:${item.role}`);
}

describe('les usages d’un visuel', () => {
  it('donne plusieurs usages à une même image, dans l’ordre de la galerie', () => {
    const form = store();
    form.media.set([slot('a'), slot('b')]);

    form.setMediaRoles('a', ['hero', 'thumbnail']);

    expect(pairs(form)).toEqual(['a:hero', 'a:thumbnail', 'b:gallery']);
    expect(form.mediaImages()).toHaveLength(2);
  });

  it('déloge le porteur du MÊME usage unique, et lui seul', () => {
    const form = store();
    form.media.set([slot('a', 'hero'), slot('a', 'lifestyle'), slot('c')]);

    form.setMediaRoles('c', ['hero']);

    // `lifestyle` est intact : ce n'est pas le même rôle, et il est pluriel.
    expect(pairs(form)).toEqual(['a:lifestyle', 'c:hero']);
  });

  it('laisse cohabiter plusieurs visuels d’un usage PLURIEL', () => {
    const form = store();
    form.media.set([slot('a'), slot('b')]);

    form.setMediaRoles('a', ['lifestyle']);
    form.setMediaRoles('b', ['lifestyle']);

    expect(pairs(form)).toEqual(['a:lifestyle', 'b:lifestyle']);
  });

  it('garde à l’écran une image délogée de son seul usage, sans l’enregistrer', () => {
    const form = store();
    form.media.set([slot('a', 'thumbnail'), slot('b')]);

    form.setMediaRoles('b', ['thumbnail']);

    expect(form.mediaImages().map((image) => image.url)).toEqual(['a', 'b']);
    expect(form.unassignedMedia().map((image) => image.url)).toEqual(['a']);
  });

  it('relit sans rien changer une fiche à ouverture et vignette sur la même image', () => {
    const form = store();
    const read = [slot('a', 'hero'), slot('a', 'thumbnail'), slot('b')];
    form.media.set(read);

    form.setMediaRoles('a', ['hero', 'thumbnail']);

    expect(form.media()).toEqual(read);
  });

  it('retire une image avec tous ses usages', () => {
    const form = store();
    form.media.set([slot('a', 'hero'), slot('a', 'thumbnail'), slot('b')]);

    form.removeMediaImage('a');

    expect(pairs(form)).toEqual(['b:gallery']);
  });
});

describe('prendre dans la médiathèque', () => {
  /**
   * Une image telle que le PANNEAU la rend. Les faits mesurés en font partie :
   * ils viennent de la bibliothèque, qui les a constatés dans les octets, et
   * les omettre ici ferait passer un doublé pour le contrat qu'il joue.
   */
  function picked(url: string, name = ''): PickedMedia {
    return {
      url,
      name,
      width: 800,
      height: 600,
      bytes: 1024,
      contentType: 'image/png',
      focal: null,
    };
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
