import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  LibraryMediaView,
  MediaCarrierView,
  MediaDetailsPayload,
  MediaLibraryPageView,
  ReplaceMediaPayload,
  UploadedMediaView,
} from '@lfd/pim-contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import type { ImageDescription } from '../image-panel/image-panel';
import { MediaLibraryHttpApi, type MediaPageRequest } from '../media-library-http-api';
import { IMAGE_MEASURE } from '../upload-check';

import {
  ReplacePanel,
  type ReplacePanelData,
  type ReplacePanelResult,
  isDescribed,
  takenOver,
} from './replace-panel';

/**
 * Ce que ces cas tiennent : **le remplacement part avant la reprise**, la
 * reprise n'est cochée d'office que si la nouvelle image n'a rien, et un
 * refus du serveur reste dans le panneau, la nouvelle image toujours
 * désignée.
 */

const A = 'https://media.test/products/a.png';
const B = 'https://media.test/products/b.png';

const OLD: ImageDescription = {
  url: A,
  name: 'Croissant au beurre',
  alt: { fr: 'Un croissant doré' },
  focal: { x: 0.3, y: 0.6 },
  tags: ['croissant', 'viennoiserie'],
  series: { id: 'ser_1', title: 'Shooting d’automne', shotOn: '2026-09-01' },
};

const CARRIERS: readonly MediaCarrierView[] = [
  { kind: 'product', id: 'prd_1', label: 'Croissant' },
  { kind: 'storefront', id: 'home', label: 'Accueil' },
];

function libraryItem(over: Partial<LibraryMediaView>): LibraryMediaView {
  return {
    url: B,
    name: '',
    tags: [],
    alt: { fr: B },
    focal: null,
    uses: 0,
    depositedAt: '2026-10-01T08:00:00.000Z',
    series: null,
    width: 1600,
    height: 1200,
    bytes: 1000,
    contentType: 'image/png',
    ...over,
  };
}

class FakeApi {
  readonly calls: string[] = [];
  carriersAnswer: readonly MediaCarrierView[] = CARRIERS;
  uploaded: { file: File; seriesId: string | null } | null = null;
  uploadAnswer: UploadedMediaView = {
    id: 'med_b',
    url: B,
    seriesId: 'ser_1',
    alreadyInLibrary: false,
    width: 1600,
    height: 1200,
    bytes: 1000,
    contentType: 'image/png',
  };
  pageAnswer: MediaLibraryPageView = { items: [], next: null, total: 0 };
  pageAsked: MediaPageRequest | null = null;
  replaced: ReplaceMediaPayload | null = null;
  replaceRefusal: HttpErrorResponse | null = null;
  described: MediaDetailsPayload | null = null;

  carriersOf(url: string): Promise<readonly MediaCarrierView[]> {
    this.calls.push(`carriers ${url}`);
    return Promise.resolve(this.carriersAnswer);
  }

  upload(file: File, seriesId: string | null): Promise<UploadedMediaView> {
    this.calls.push('upload');
    this.uploaded = { file, seriesId };
    return Promise.resolve(this.uploadAnswer);
  }

  page(request: MediaPageRequest): Promise<MediaLibraryPageView> {
    this.pageAsked = request;
    return Promise.resolve(this.pageAnswer);
  }

  replace(payload: ReplaceMediaPayload): Promise<void> {
    this.calls.push('replace');
    if (this.replaceRefusal !== null) {
      return Promise.reject(this.replaceRefusal);
    }
    this.replaced = payload;
    return Promise.resolve();
  }

  describe(details: MediaDetailsPayload): Promise<void> {
    this.calls.push('describe');
    this.described = details;
    return Promise.resolve();
  }
}

interface Mounted {
  readonly fixture: ComponentFixture<ReplacePanel>;
  readonly panel: ReplacePanel;
  readonly closed: (ReplacePanelResult | undefined)[];
  readonly text: () => string;
}

async function mount(
  api: FakeApi,
  lookup: ReplacePanelData['lookup'] = () => null,
): Promise<Mounted> {
  const closed: (ReplacePanelResult | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: MediaLibraryHttpApi, useValue: api },
      { provide: IMAGE_MEASURE, useValue: () => Promise.resolve(null) },
      {
        provide: FoldPanelRef,
        useValue: { close: (result?: ReplacePanelResult): void => void closed.push(result) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ReplacePanel);
  const data: ReplacePanelData = { from: OLD, seriesChoices: () => [], lookup };
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, panel: fixture.componentInstance, closed, text: () => host.textContent };
}

async function settle(mounted: Mounted): Promise<void> {
  mounted.fixture.detectChanges();
  await mounted.fixture.whenStable();
  mounted.fixture.detectChanges();
}

function png(name = 'b.png'): File {
  return new File(['octets'], name, { type: 'image/png' });
}

describe('ReplacePanel', () => {
  it('nomme les porteurs de l’ancienne image et annonce leur nombre', async () => {
    const api = new FakeApi();
    const mounted = await mount(api);

    expect(api.calls).toEqual([`carriers ${A}`]);
    expect(mounted.text()).toContain('Elle sera remplacée chez 2 porteurs');
    expect(mounted.text()).toContain('Accueil');
    expect(mounted.text()).toContain('Remplacer chez 2 porteurs');
    // Rien n'est encore désigné : le bouton reste fermé.
    expect(mounted.panel['canReplace']()).toBe(false);
  });

  it('dépose dans la série de l’ancienne, et coche la reprise : la nouvelle n’a rien', async () => {
    const api = new FakeApi();
    const mounted = await mount(api);

    await mounted.panel['deposit']([png()]);
    await settle(mounted);

    expect(api.uploaded?.seriesId).toBe('ser_1');
    expect(mounted.panel['candidate']()?.image.url).toBe(B);
    expect(mounted.panel['takeOver']()).toBe(true);
    expect(mounted.panel['canReplace']()).toBe(true);
  });

  it('refuse avant l’envoi un fichier que le serveur refuserait', async () => {
    const api = new FakeApi();
    const mounted = await mount(api);

    await mounted.panel['deposit']([new File([], 'vide.png', { type: 'image/png' })]);
    await settle(mounted);

    expect(api.uploaded).toBeNull();
    expect(mounted.text()).toContain('le fichier est vide');
  });

  it('dit qu’un fichier est déjà au fonds, et ne coche pas la reprise s’il est décrit', async () => {
    const api = new FakeApi();
    api.uploadAnswer = { ...api.uploadAnswer, alreadyInLibrary: true };
    const known: ImageDescription = { ...OLD, url: B, name: 'Pain au chocolat' };
    const mounted = await mount(api, (url) => (url === B ? known : null));

    await mounted.panel['deposit']([png()]);
    await settle(mounted);

    expect(mounted.text()).toContain('déjà dans la médiathèque');
    expect(mounted.panel['takeOver']()).toBe(false);
  });

  it('dans le doute — déjà au fonds mais hors du fil — n’écrase rien d’office', async () => {
    const api = new FakeApi();
    api.uploadAnswer = { ...api.uploadAnswer, alreadyInLibrary: true };
    const mounted = await mount(api);

    await mounted.panel['deposit']([png()]);
    await settle(mounted);

    expect(mounted.panel['candidate']()?.described).toBeNull();
    expect(mounted.panel['takeOver']()).toBe(false);
  });

  it('choisit dans le fonds : la reprise suit ce que la nouvelle porte déjà', async () => {
    const api = new FakeApi();
    api.pageAnswer = { items: [libraryItem({})], next: null, total: 1 };
    const mounted = await mount(api);

    mounted.panel['choose']('library');
    await settle(mounted);
    expect(api.pageAsked?.q).toBe('');

    mounted.panel['pick'](libraryItem({}));
    expect(mounted.panel['takeOver']()).toBe(true);

    mounted.panel['pick'](libraryItem({ tags: ['pain'] }));
    expect(mounted.panel['takeOver']()).toBe(false);
  });

  it('remplace PUIS reprend la description, sans toucher à la série', async () => {
    const api = new FakeApi();
    const mounted = await mount(api);
    await mounted.panel['deposit']([png()]);
    await settle(mounted);

    mounted.panel['ask']();
    await mounted.panel['replace']();

    expect(api.calls.slice(-2)).toEqual(['replace', 'describe']);
    expect(api.replaced).toEqual({ from: A, to: B });
    expect(api.described).toEqual({
      url: B,
      name: 'Croissant au beurre',
      tags: ['croissant', 'viennoiserie'],
      alt: { fr: 'Un croissant doré' },
      focal: { x: 0.3, y: 0.6 },
    });
    expect(api.described && 'seriesId' in api.described).toBe(false);
    expect(mounted.closed).toEqual([{ to: B, carriers: 2, description: true }]);
  });

  it('ne reprend rien quand la case est décochée', async () => {
    const api = new FakeApi();
    const mounted = await mount(api);
    await mounted.panel['deposit']([png()]);
    mounted.panel['takeOver'].set(false);

    mounted.panel['ask']();
    await mounted.panel['replace']();

    expect(api.calls).not.toContain('describe');
    expect(mounted.closed).toEqual([{ to: B, carriers: 2, description: null }]);
  });

  it('garde le refus du serveur dans le panneau, la nouvelle image toujours désignée', async () => {
    const api = new FakeApi();
    api.replaceRefusal = new HttpErrorResponse({
      status: 409,
      error: { message: 'La vitrine a changé entre-temps : relisez-la puis recommencez.' },
    });
    const mounted = await mount(api);
    await mounted.panel['deposit']([png()]);

    mounted.panel['ask']();
    await mounted.panel['replace']();
    await settle(mounted);

    expect(mounted.closed).toEqual([]);
    expect(api.calls).not.toContain('describe');
    expect(mounted.text()).toContain('La vitrine a changé entre-temps');
    expect(mounted.panel['candidate']()?.image.url).toBe(B);
    expect(mounted.panel['takeOver']()).toBe(true);
  });

  it('refuse de désigner l’image actuelle', async () => {
    const api = new FakeApi();
    api.uploadAnswer = { ...api.uploadAnswer, url: A, alreadyInLibrary: true };
    const mounted = await mount(api);

    await mounted.panel['deposit']([png('a.png')]);
    await settle(mounted);

    expect(mounted.text()).toContain('C’est l’image actuelle');
    expect(mounted.panel['canReplace']()).toBe(false);
  });
});

describe('isDescribed / takenOver', () => {
  it('ne prend pas le repli sur l’adresse pour une description', () => {
    const bare: ImageDescription = { ...OLD, name: '', tags: [], focal: null, alt: { fr: A } };
    expect(isDescribed(bare)).toBe(false);
    expect(isDescribed({ ...bare, focal: { x: 0.5, y: 0.5 } })).toBe(true);
  });

  it('omet une alternative qui n’en est pas une', () => {
    const payload = takenOver({ ...OLD, alt: { fr: A } }, B);
    expect('alt' in payload).toBe(false);
  });
});
