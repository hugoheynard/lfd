import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import type { LibraryMediaView, MediaLibraryPageView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { MediaFeedStore } from './media-feed';
import { ALL_MEDIA } from './media-feed-url';
import { MediaLibraryHttpApi, type MediaPageRequest } from './media-library-http-api';

function image(url: string): LibraryMediaView {
  return {
    url,
    name: '',
    uses: 0,
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
  pages: (MediaLibraryPageView | { readonly refuse: unknown })[] = [];
  requests: MediaPageRequest[] = [];
  /** Une réponse retenue, rendue à la main — pour croiser deux lectures. */
  held: ((page: MediaLibraryPageView) => void) | null = null;
  hold = false;

  page(request: MediaPageRequest): Promise<MediaLibraryPageView> {
    this.requests.push(request);
    if (this.hold) {
      this.hold = false;
      return new Promise((resolve) => (this.held = resolve));
    }
    const next = this.pages.shift() ?? { items: [], total: 0, next: null };
    return 'refuse' in next ? Promise.reject(next.refuse) : Promise.resolve(next);
  }
}

function setup(): { feed: MediaFeedStore; library: FakeLibrary } {
  const library = new FakeLibrary();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      MediaFeedStore,
      { provide: MediaLibraryHttpApi, useValue: library },
    ],
  });
  return { feed: TestBed.inject(MediaFeedStore), library };
}

describe('le fil de la médiathèque', () => {
  it('met les pages bout à bout, en rendant le curseur tel quel', async () => {
    const { feed, library } = setup();
    library.pages = [
      { items: [image('a'), image('b')], total: 3, next: 'c1' },
      { items: [image('c')], total: 3, next: null },
    ];

    await feed.restart(ALL_MEDIA);
    await feed.more();

    expect(feed.items().map((item) => item.url)).toEqual(['a', 'b', 'c']);
    expect(library.requests.map((request) => request.after)).toEqual([undefined, 'c1']);
    expect(feed.total()).toBe(3);
  });

  it('s’arrête sur `next: null`, et ne redemande rien', async () => {
    const { feed, library } = setup();
    library.pages = [{ items: [image('a')], total: 1, next: null }];

    await feed.restart(ALL_MEDIA);
    await feed.more();

    expect(feed.hasMore()).toBe(false);
    expect(library.requests).toHaveLength(1);
  });

  it('continue après une page VIDE qui annonce une suite', async () => {
    // « Inutilisées » filtre hors base : une page peut revenir vide avec un `next`.
    const { feed, library } = setup();
    library.pages = [
      { items: [], total: 1, next: 'c1' },
      { items: [image('a')], total: 1, next: null },
    ];

    await feed.restart({ ...ALL_MEDIA, unused: true });
    expect(feed.hasMore()).toBe(true);
    await feed.more();

    expect(feed.items().map((item) => item.url)).toEqual(['a']);
  });

  it('repart de zéro, sans curseur, quand le critère change', async () => {
    const { feed, library } = setup();
    library.pages = [
      { items: [image('a')], total: 2, next: 'c1' },
      { items: [image('z')], total: 1, next: null },
    ];

    await feed.restart(ALL_MEDIA);
    await feed.restart({ ...ALL_MEDIA, sort: 'name' });

    expect(feed.items().map((item) => item.url)).toEqual(['z']);
    expect(library.requests.at(-1)).not.toHaveProperty('after');
    expect(library.requests.at(-1)?.sort).toBe('name');
    expect(feed.pages()).toBe(1);
  });

  it('jette une réponse arrivée après un changement de critère', async () => {
    const { feed, library } = setup();
    library.hold = true;
    const slow = feed.restart(ALL_MEDIA);
    library.pages = [{ items: [image('neuf')], total: 1, next: null }];
    await feed.restart({ ...ALL_MEDIA, q: 'croissant' });

    library.held?.({ items: [image('ancien')], total: 1, next: null });
    await slow;

    expect(feed.items().map((item) => item.url)).toEqual(['neuf']);
    expect(feed.loading()).toBe(false);
  });

  it('dit la fin seulement après plus d’une page', async () => {
    const { feed, library } = setup();
    library.pages = [{ items: [image('a')], total: 1, next: null }];
    await feed.restart(ALL_MEDIA);
    expect(feed.ended()).toBe(false);

    library.pages = [
      { items: [image('a')], total: 2, next: 'c1' },
      { items: [image('b')], total: 2, next: null },
    ];
    await feed.restart(ALL_MEDIA);
    await feed.more();
    expect(feed.ended()).toBe(true);
  });

  it('porte le message du SERVEUR quand il refuse un tri', async () => {
    const { feed, library } = setup();
    library.pages = [
      {
        refuse: new HttpErrorResponse({
          status: 409,
          error: { message: 'Le fonds est trop grand pour être trié par emplois.' },
        }),
      },
    ];

    await feed.restart({ ...ALL_MEDIA, sort: 'uses' });

    expect(feed.failure()).toBe('Le fonds est trop grand pour être trié par emplois.');
    expect(feed.items()).toEqual([]);
  });

  it('garde ce qui est lu quand la suite échoue, et la rejoue', async () => {
    const { feed, library } = setup();
    library.pages = [
      { items: [image('a')], total: 2, next: 'c1' },
      { refuse: new Error('réseau') },
      { items: [image('b')], total: 2, next: null },
    ];

    await feed.restart(ALL_MEDIA);
    await feed.more();
    expect(feed.failure()).not.toBeNull();
    expect(feed.items().map((item) => item.url)).toEqual(['a']);

    await feed.retry();
    expect(feed.failure()).toBeNull();
    expect(feed.items().map((item) => item.url)).toEqual(['a', 'b']);
    expect(library.requests.at(-1)?.after).toBe('c1');
  });

  it('retire une image sans toucher au curseur', async () => {
    const { feed, library } = setup();
    library.pages = [{ items: [image('a'), image('b')], total: 5, next: 'c1' }];
    await feed.restart(ALL_MEDIA);

    feed.drop('a');

    expect(feed.items().map((item) => item.url)).toEqual(['b']);
    expect(feed.total()).toBe(4);
    expect(feed.hasMore()).toBe(true);
  });
});
