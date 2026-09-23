import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  LibraryMediaView,
  MediaLibraryPageView,
  MediaUploadFailureView,
} from '@lfd/pim-contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaLibraryHttpApi } from '../media-library-http-api';

import { MediathequePage } from './mediatheque-page';

/**
 * Ce que ces cas tiennent : **l'écran DIT ce que l'image porte, avant que
 * quiconque propose de la supprimer**.
 *
 * On ne supprime pas une image qu'un porteur affiche. 🔴 Cette phrase disait
 * « les clés étrangères sont en `ON DELETE RESTRICT`, et la base refuse » :
 * c'est faux depuis le 2026-09-23. La bibliothèque a son propre schéma, il n'y
 * a plus de clé étrangère, et la règle vit ENTIÈREMENT dans le code. Croire
 * que Postgres la tient encore ferait retirer le garde-fou qui l'a remplacé.
 *
 * Sans le compte d'emplois à l'écran, cette règle s'apprendrait par un échec —
 * et sans la LISTE derrière, elle s'apprendrait sans qu'on puisse rien y
 * faire.
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
  /** Ce que l'historique PERSISTANT rend — distinct de la file en mémoire. */
  past: MediaUploadFailureView[] = [];
  failuresCalls = 0;

  failures(): Promise<readonly MediaUploadFailureView[]> {
    this.failuresCalls += 1;
    return Promise.resolve(this.past);
  }

  pages: MediaLibraryPageView[] = [];
  fails = false;
  calls: { limit: number; offset: number; q: string; tags: readonly string[] }[] = [];

  page(
    limit: number,
    offset: number,
    q = '',
    tags: readonly string[] = [],
  ): Promise<MediaLibraryPageView> {
    this.calls.push({ limit, offset, q, tags });
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

describe('la médiathèque — la recherche', () => {
  /**
   * Régression (2026-09-23) : la recherche filtrait ce qui était CHARGÉ. Le
   * fonds se parcourt soixante par soixante, donc une image non chargée était
   * introuvable quoi qu'on tape — et rien à l'écran ne le disait.
   */
  it('envoie le critère au SERVEUR', async () => {
    const screen = page();
    screen['search'].set('croissant');

    await screen['refilter']();

    expect(library.calls.at(-1)?.q).toBe('croissant');
  });

  it('repart du DÉBUT quand le critère change', async () => {
    // `load()` ajoute à ce qui est affiché — il sert « charger plus ».
    // Réutilisé tel quel, il collerait les résultats du nouveau filtre à la
    // suite de ceux de l'ancien.
    const screen = page();
    library.pages = [
      { items: [image('a'), image('b')], total: 2 },
      { items: [image('c')], total: 1 },
    ];
    await screen['load']();

    screen['search'].set('croissant');
    await screen['refilter']();

    expect(screen['items']().map((item) => item.url)).toEqual(['c']);
    expect(library.calls.at(-1)?.offset).toBe(0);
  });

  it('restreint en cumulant les mots-clés retenus', async () => {
    const screen = page();

    await screen['toggleFilterTag']('viennoiserie');
    await screen['toggleFilterTag']('packshot');

    expect(library.calls.at(-1)?.tags).toEqual(['viennoiserie', 'packshot']);
  });

  it('relâche un mot-clé retenu deux fois', async () => {
    const screen = page();

    await screen['toggleFilterTag']('viennoiserie');
    await screen['toggleFilterTag']('viennoiserie');

    expect(library.calls.at(-1)?.tags).toEqual([]);
    expect(screen['filtering']()).toBe(false);
  });
});

describe("la médiathèque — l'historique des refus", () => {
  function refusal(fileName: string): MediaUploadFailureView {
    return {
      id: `f_${fileName}`,
      fileName,
      reason: 'Visuel refusé : format non accepté.',
      code: 'catalogue.media.unsupported_image',
      bytes: 1024,
      contentType: null,
      actorName: 'Hugo',
      occurredAt: '2026-09-23T08:00:00.000Z',
    };
  }

  /**
   * Régression (2026-09-23) : le compte rendu d'un lot vivait en mémoire.
   * Fermer l'onglet l'effaçait, et « qu'est-ce qui n'est pas entré hier »
   * n'avait aucune réponse.
   */
  it('lit le serveur à l’OUVERTURE, pas au chargement de la page', async () => {
    // Personne ne consulte l'historique à chaque visite : le charger d'office
    // coûterait une requête à tout le monde pour servir quelques-uns.
    const screen = page();
    expect(library.failuresCalls).toBe(0);

    library.past = [refusal('croissant.heic')];
    await screen['togglePast']();

    expect(library.failuresCalls).toBe(1);
    expect(screen['pastFailures']().map((f) => f.fileName)).toEqual(['croissant.heic']);
  });

  it('referme sans relire', async () => {
    const screen = page();
    await screen['togglePast']();
    await screen['togglePast']();

    expect(screen['showPast']()).toBe(false);
    expect(library.failuresCalls).toBe(1);
  });
});
