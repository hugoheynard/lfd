import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { LibraryMediaView, MediaLibraryPageView } from '@lfd/pim-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaLibraryHttpApi } from '../media-library-http-api';

import { MediathequePage } from './mediatheque-page';

/**
 * Ce que ces cas tiennent : **l'écran DIT ce que l'image porte, avant que
 * quiconque propose de la supprimer**.
 *
 * On ne supprime pas une image qu'un porteur affiche — les clés étrangères sont
 * en `ON DELETE RESTRICT`, et la base refuse. Sans le compte d'emplois à
 * l'écran, cette règle s'apprendrait par un échec.
 *
 * Et l'échec de lecture a son propre état : une grille vide et une grille qui
 * n'a pas pu charger se ressemblent, et les confondre ferait croire le fonds
 * vide au premier réseau qui tousse.
 */

function image(url: string, name = '', uses = 0): LibraryMediaView {
  return {
    url,
    name,
    uses,
    tags: [],
    alt: { fr: url },
    focal: null,
    width: null,
    height: null,
    bytes: null,
    contentType: null,
    depositedAt: '2026-09-23T08:00:00.000Z',
  };
}

class FakeLibrary {
  pages: MediaLibraryPageView[] = [];
  fails = false;
  calls: { limit: number; offset: number }[] = [];

  page(limit: number, offset: number): Promise<MediaLibraryPageView> {
    this.calls.push({ limit, offset });
    if (this.fails) {
      return Promise.reject(new Error('réseau'));
    }
    return Promise.resolve(this.pages.shift() ?? { items: [], total: 0 });
  }
}

let library: FakeLibrary;

function page(): MediathequePage {
  TestBed.resetTestingModule();
  library = new FakeLibrary();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: MediaLibraryHttpApi, useFactory: () => library },
    ],
  });
  return TestBed.createComponent(MediathequePage).componentInstance;
}

// `library` est construit dans `page()`, mais le fournisseur doit exister avant
// l'instanciation : d'où la fabrique, qui lit la variable au moment de l'appel.
beforeEach(() => {
  vi.restoreAllMocks();
});

describe('la médiathèque', () => {
  it('dit combien de porteurs affichent une image', () => {
    const screen = page();

    expect(screen['usesLabel'](image('a', '', 0))).toBe('aucun emploi');
    expect(screen['usesLabel'](image('a', '', 1))).toBe('1 emploi');
    expect(screen['usesLabel'](image('a', '', 3))).toBe('3 emplois');
  });

  it('avoue qu’une image n’a pas d’étiquette plutôt que de laisser un vide', () => {
    const screen = page();

    expect(screen['label'](image('https://cdn.test/products/abc.png'))).toBe('Sans étiquette');
    expect(screen['label'](image('a', 'croissant de face'))).toBe('croissant de face');
  });

  it('retombe sur le nom de fichier pour reconnaître une image non nommée', () => {
    const screen = page();

    expect(screen['fileOf'](image('https://cdn.test/products/abc.png'))).toBe('abc.png');
  });

  /**
   * Régression attendue : un échec de lecture qui laisserait la grille vide
   * afficherait « la bibliothèque est vide » — le pire des messages, parce
   * qu'il est rassurant et faux.
   */
  it('ne fait PAS passer un échec de lecture pour un fonds vide', async () => {
    const screen = page();
    library.fails = true;

    await screen['load']();

    expect(screen['failure']()).not.toBeNull();
    expect(screen['items']()).toHaveLength(0);
  });

  it('empile les pages au lieu de les remplacer, et avance d’autant', async () => {
    const screen = page();
    library.pages = [
      { items: [image('a'), image('b')], total: 3 },
      { items: [image('c')], total: 3 },
    ];

    await screen['load']();
    await screen['load']();

    expect(screen['items']().map((item) => item.url)).toEqual(['a', 'b', 'c']);
    // L'offset suit ce qui a été REÇU, pas ce qui a été demandé : une page
    // courte ne doit pas faire sauter des images.
    expect(library.calls.map((call) => call.offset)).toEqual([0, 0, 2]);
    expect(screen['hasMore']()).toBe(false);
  });
});
