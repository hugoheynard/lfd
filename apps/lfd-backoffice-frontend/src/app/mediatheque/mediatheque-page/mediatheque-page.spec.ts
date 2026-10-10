import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type {
  LibraryMediaView,
  MediaDetailsPayload,
  MediaLibraryPageView,
  MediaTagView,
  MediaSeriesView,
  RenameMediaTagPayload,
} from '@lfd/pim-contracts';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ALL_MEDIA } from '../media-feed-url';

import { NotifyService } from '../../notify.service';
import { MediaLibraryHttpApi, type MediaPageRequest } from '../media-library-http-api';

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
    series: null,
  };
}

class FakeLibrary {
  vocabulary: MediaTagView[] = [];
  described: MediaDetailsPayload[] = [];
  renamed: RenameMediaTagPayload[] = [];
  removed: string[] = [];
  refuseNext: unknown = null;

  tags(): Promise<readonly MediaTagView[]> {
    return Promise.resolve(this.vocabulary);
  }

  describe(details: MediaDetailsPayload): Promise<void> {
    this.described.push(details);
    return Promise.resolve();
  }

  renameTag(payload: RenameMediaTagPayload): Promise<void> {
    if (this.refuseNext !== null) {
      return Promise.reject(this.refuseNext);
    }
    this.renamed.push(payload);
    return Promise.resolve();
  }

  removeTag(tag: string): Promise<void> {
    this.removed.push(tag);
    return Promise.resolve();
  }

  seriesList: MediaSeriesView[] = [];

  series(): Promise<readonly MediaSeriesView[]> {
    return Promise.resolve(this.seriesList);
  }

  pages: MediaLibraryPageView[] = [];
  fails = false;
  calls: MediaPageRequest[] = [];

  page(request: MediaPageRequest): Promise<MediaLibraryPageView> {
    this.calls.push(request);
    if (this.fails) {
      return Promise.reject(new Error('réseau'));
    }
    return Promise.resolve(this.pages.shift() ?? { items: [], total: 0, next: null });
  }
}

let library: FakeLibrary;

/** Ce que le prochain panneau ouvert rendra à sa fermeture. */
let panelResult: unknown;
let opened: unknown[];

class FakeNotify {
  successes: string[] = [];
  refusals: unknown[] = [];
  success(message: string): void {
    this.successes.push(message);
  }
  refused(error: unknown): void {
    this.refusals.push(error);
  }
}
let notify: FakeNotify;

function page(): MediathequePage {
  TestBed.resetTestingModule();
  library = new FakeLibrary();
  notify = new FakeNotify();
  opened = [];
  panelResult = undefined;
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: MediaLibraryHttpApi, useFactory: () => library },
      { provide: NotifyService, useFactory: () => notify },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_component: unknown, config: { data: unknown }) => {
            opened.push(config.data);
            return { closed: Promise.resolve(panelResult) };
          },
        },
      },
    ],
  });
  return TestBed.createComponent(MediathequePage).componentInstance;
}

/**
 * Relit le fonds sous les critères courants. Le constructeur a déjà lancé une
 * lecture (l'adresse émet d'emblée) ; celle-ci la remplace, et la réponse de
 * la première est jetée.
 */
async function reread(screen: MediathequePage): Promise<void> {
  await screen['feed'].restart(screen['criteria']());
}

// `library` est construit dans `page()`, mais le fournisseur doit exister avant
// l'instanciation : d'où la fabrique, qui lit la variable au moment de l'appel.
beforeEach(() => {
  vi.restoreAllMocks();
});

describe('la médiathèque', () => {
  it('dit combien de porteurs affichent une image', () => {
    const screen = page();

    expect(screen['usesLabel'](image('a', '', 0))).toBe('Inutilisée');
    expect(screen['usesLabel'](image('a', '', 1))).toBe('1 emploi');
    expect(screen['usesLabel'](image('a', '', 3))).toBe('3 emplois');
  });

  it('avoue qu’une image n’a pas d’étiquette plutôt que de laisser un vide', () => {
    const screen = page();

    expect(screen['label'](image('https://cdn.test/products/abc.png'))).toBe('Sans nom');
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

    await reread(screen);

    expect(screen['feed'].failure()).not.toBeNull();
    expect(screen['feed'].items()).toHaveLength(0);
  });

  it('empile les pages au lieu de les remplacer, par curseur', async () => {
    const screen = page();
    library.pages = [
      { items: [image('a'), image('b')], total: 3, next: 'c1' },
      { items: [image('c')], total: 3, next: null },
    ];

    await reread(screen);
    await screen['feed'].more();

    expect(screen['feed'].items().map((item) => item.url)).toEqual(['a', 'b', 'c']);
    // 🔴 Plus aucun `offset` ne part (plan L2) : la suite se lit par `after`.
    expect(library.calls.map((call) => call.after)).toEqual([undefined, undefined, 'c1']);
    expect(library.calls.some((call) => 'offset' in call)).toBe(false);
    expect(screen['feed'].hasMore()).toBe(false);
  });

  it('dit la fin du fonds en bas de grille après plus d’une page', async () => {
    const screen = page();
    library.pages = [
      { items: [image('a')], total: 2, next: 'c1' },
      { items: [image('b')], total: 2, next: null },
    ];

    await reread(screen);
    expect(screen['tail']()).toBe('more');
    await screen['feed'].more();

    expect(screen['tail']()).toBe('end');
  });

  it('ne pose des intercalaires que sous les tris par date', async () => {
    const screen = page();
    library.pages = [{ items: [image('a')], total: 1, next: null }];
    await reread(screen);
    expect(screen['rows']().map((row) => row.kind)).toEqual(['divider', 'image']);

    library.pages = [{ items: [image('a')], total: 1, next: null }];
    await screen['show']({ ...screen['criteria'](), sort: 'name' });
    expect(screen['rows']().map((row) => row.kind)).toEqual(['image']);
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
    await screen['show']({ ...screen['criteria'](), q: 'croissant' });

    expect(library.calls.at(-1)?.q).toBe('croissant');
  });

  it('repart du DÉBUT quand le critère change', async () => {
    // Le curseur encode la clé du tri qui l'a produit : rejoué sous un autre
    // critère, il reprendrait au milieu d'une autre liste.
    const screen = page();
    library.pages = [
      { items: [image('a'), image('b')], total: 3, next: 'c1' },
      { items: [image('c')], total: 1, next: null },
    ];
    await reread(screen);

    await screen['show']({ ...screen['criteria'](), q: 'croissant' });

    expect(screen['feed'].items().map((item) => item.url)).toEqual(['c']);
    expect(library.calls.at(-1)).not.toHaveProperty('after');
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

describe('la médiathèque — les mots-clés', () => {
  function tagged(url: string, tags: string[]): LibraryMediaView {
    return { ...image(url), tags };
  }

  it('remplit la bande au démarrage, depuis le fonds entier', async () => {
    const screen = page();
    library.vocabulary = [{ tag: 'croissant', count: 12 }];

    await screen['palette'].refresh();

    expect(screen['palette'].all()).toEqual([{ tag: 'croissant', count: 12, fresh: false }]);
  });

  /** D1 : le retrait est immédiat, et l'annulation repose le mot à SA place. */
  it('repose un mot retiré d’une tuile, à sa place, par le même PUT', async () => {
    const screen = page();
    library.pages = [
      { items: [tagged('a', ['beurre', 'croissant', 'pain'])], total: 1, next: null },
    ];
    await reread(screen);

    await screen['strip'](screen['feed'].items()[0]!, 'croissant');
    expect(screen['feed'].items()[0]?.tags).toEqual(['beurre', 'pain']);
    const [last] = screen['stripped']();
    expect(last?.tag).toBe('croissant');

    await screen['undoStrip'](last!);

    expect(screen['feed'].items()[0]?.tags).toEqual(['beurre', 'croissant', 'pain']);
    expect(library.described.at(-1)?.tags).toEqual(['beurre', 'croissant', 'pain']);
    expect(screen['stripped']()).toEqual([]);
  });

  /**
   * Régression : poser ou retirer un mot depuis la bande omettait
   * l'alternative, que le serveur lit alors comme effacée — chaque mot-clé
   * effaçait la description de l'image (corrigé le 2026-10-10).
   */
  it('garde l’alternative de l’image quand on pose ou retire un mot', async () => {
    const screen = page();
    const described = { ...tagged('a', ['croissant']), alt: { fr: 'Croissant doré' } };
    library.pages = [{ items: [described], total: 1, next: null }];
    await reread(screen);

    await screen['strip'](screen['feed'].items()[0]!, 'croissant');
    expect(library.described.at(-1)?.alt).toEqual({ fr: 'Croissant doré' });

    await screen['apply'](screen['feed'].items()[0]!, 'beurre');
    expect(library.described.at(-1)?.alt).toEqual({ fr: 'Croissant doré' });
  });

  it('renomme partout, l’annonce, et suit le filtre', async () => {
    const screen = page();
    library.vocabulary = [{ tag: 'croisant', count: 3 }];
    await screen['palette'].refresh();
    await screen['toggleFilterTag']('croisant');
    panelResult = { to: 'croissant' };

    await screen['rename']({ tag: 'croisant', count: 3, fresh: false });

    expect(library.renamed).toEqual([{ from: 'croisant', to: 'croissant' }]);
    expect(notify.successes).toEqual(['Mot-clé renommé']);
    expect(screen['criteria']().tags).toEqual(['croissant']);
  });

  it('dit « fusionnés » quand le mot existait déjà, et passe les comptes au panneau', async () => {
    const screen = page();
    library.vocabulary = [
      { tag: 'croisant', count: 3 },
      { tag: 'croissant', count: 12 },
    ];
    await screen['palette'].refresh();
    panelResult = { to: 'croissant' };

    await screen['rename']({ tag: 'croisant', count: 3, fresh: false });

    expect(opened[0]).toEqual({
      tag: { tag: 'croisant', count: 3 },
      vocabulary: [
        { tag: 'croisant', count: 3 },
        { tag: 'croissant', count: 12 },
      ],
    });
    expect(notify.successes).toEqual(['Mots-clés fusionnés']);
  });

  it('rapporte le refus du serveur, et n’annonce aucun succès', async () => {
    const screen = page();
    const refusal = new Error('404');
    library.refuseNext = refusal;
    panelResult = { to: 'croissant' };

    await screen['rename']({ tag: 'croisant', count: 3, fresh: false });

    expect(notify.refusals).toEqual([refusal]);
    expect(notify.successes).toEqual([]);
  });

  it('n’écrit rien quand on annule le renommage', async () => {
    const screen = page();

    await screen['rename']({ tag: 'croisant', count: 3, fresh: false });

    expect(library.renamed).toEqual([]);
  });

  it('retire partout après confirmation, en disant de combien d’images', async () => {
    const screen = page();
    await screen['toggleFilterTag']('croisant');
    panelResult = true;

    await screen['removeEverywhere']({ tag: 'croisant', count: 3, fresh: false });

    expect(opened[0]).toEqual({ tag: { tag: 'croisant', count: 3 } });
    expect(library.removed).toEqual(['croisant']);
    expect(notify.successes).toEqual(['Mot-clé retiré de 3 images']);
    expect(screen['criteria']().tags).toEqual([]);
  });
});

describe("la médiathèque — l'adresse porte la vue", () => {
  it('relit le fonds sous ce que l’adresse demande', async () => {
    const screen = page();
    await TestBed.inject(Router).navigateByUrl('/?sort=uses&tags=a,b&unused=1');

    await vi.waitFor(() => expect(screen['criteria']().sort).toBe('uses'));
    expect(screen['criteria']()).toEqual({
      ...ALL_MEDIA,
      sort: 'uses',
      tags: ['a', 'b'],
      unused: true,
    });
    expect(library.calls.at(-1)).toMatchObject({ sort: 'uses', tags: ['a', 'b'], unused: true });
  });

  it('écrit un critère dans l’adresse, sans le curseur, et sans relire deux fois', async () => {
    const screen = page();
    const router = TestBed.inject(Router);
    library.pages = [{ items: [image('a')], total: 9, next: 'c1' }];
    await reread(screen);
    const before = library.calls.length;

    await screen['show']({ ...screen['criteria'](), untagged: true, from: '2026-10-01' });

    await vi.waitFor(() => expect(router.url).toContain('untagged=1'));
    expect(router.url).toContain('from=2026-10-01');
    expect(router.url).not.toContain('after');
    expect(library.calls.length).toBe(before + 1);
  });

  it('« Tout afficher » rend l’adresse nue mais garde le tri', async () => {
    const screen = page();
    const router = TestBed.inject(Router);
    await screen['show']({ ...ALL_MEDIA, sort: 'name', q: 'croissant', unused: true });

    await screen['clearFilter']();

    await vi.waitFor(() => expect(router.url).toBe('/?sort=name'));
  });
});

describe('la médiathèque — la série d’une image (L3)', () => {
  const CARTE: MediaSeriesView = {
    id: 's1',
    title: 'Shooting carte 2026',
    shotOn: '2026-03-14',
    note: null,
    images: 3,
    createdAt: '2026-03-20T10:00:00.000Z',
  };

  it('envoie la série au même enregistrement, et la montre sur la tuile', async () => {
    const screen = page();
    library.seriesList = [CARTE];
    await screen['series'].refresh();
    library.pages = [{ items: [image('a')], total: 1, next: null }];
    await reread(screen);

    const saved = await screen['writeDescription']({
      url: 'a',
      name: '',
      alt: { fr: '' },
      focal: null,
      tags: [],
      seriesId: 's1',
    });

    expect(saved).toBe(true);
    expect(library.described.at(-1)?.seriesId).toBe('s1');
    expect(screen['feed'].items()[0]?.series).toEqual({
      id: 's1',
      title: 'Shooting carte 2026',
      shotOn: '2026-03-14',
    });
  });

  it('les gestes de mots-clés n’envoient PAS la série — absente, elle ne change pas', async () => {
    const screen = page();
    library.pages = [
      {
        items: [{ ...image('a'), series: { id: 's1', title: 'x', shotOn: null } }],
        total: 1,
        next: null,
      },
    ];
    await reread(screen);

    await screen['apply'](screen['feed'].items()[0]!, 'beurre');

    expect(library.described.at(-1)).not.toHaveProperty('seriesId');
  });

  it('passe la série de l’image au panneau', async () => {
    const screen = page();
    library.pages = [
      {
        items: [{ ...image('a'), series: { id: 's1', title: 'x', shotOn: null } }],
        total: 1,
        next: null,
      },
    ];
    await reread(screen);

    screen['describe'](screen['feed'].items()[0]!);

    expect(opened.at(-1)).toMatchObject({ series: { id: 's1' } });
  });
});
