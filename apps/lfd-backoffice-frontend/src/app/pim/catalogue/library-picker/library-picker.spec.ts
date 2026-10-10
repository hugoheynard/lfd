import { TestBed } from '@angular/core/testing';
import type { LibraryMediaView, MediaLibraryPageView } from '@lfd/pim-contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import {
  MediaLibraryHttpApi,
  type MediaPageRequest,
} from '../../../mediatheque/media-library-http-api';
import { LibraryPicker, type LibraryPickerData, type PickedMedia } from './library-picker';

/**
 * Le sélecteur désigne, il ne dépose pas. Ce qu'on tient ici : l'ordre des
 * désignations est rendu tel quel, et en mode `single` une désignation
 * REMPLACE la précédente — l'image d'une info de vitrine est une seule image.
 */
function image(url: string): LibraryMediaView {
  return {
    url,
    name: url,
    tags: [],
    alt: { fr: url },
    focal: null,
    uses: 0,
    depositedAt: '2026-01-01T00:00:00.000Z',
    series: null,
    width: 800,
    height: 600,
    bytes: 1000,
    contentType: 'image/jpeg',
  };
}

async function setup(
  data: LibraryPickerData,
  pages: MediaLibraryPageView[] = [{ items: [image('a'), image('b')], total: 2, next: null }],
) {
  const closed: (readonly PickedMedia[] | undefined)[] = [];
  const requests: MediaPageRequest[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FoldPanelRef,
        useValue: { close: (value?: readonly PickedMedia[]) => closed.push(value) },
      },
      {
        provide: MediaLibraryHttpApi,
        useValue: {
          page: async (request: MediaPageRequest) => {
            requests.push(request);
            return pages.shift() ?? { items: [], total: 0, next: null };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LibraryPicker);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  const picker = fixture.componentInstance;
  await vi.waitFor(() => expect(picker['loading']()).toBe(false));
  return { picker, closed, requests };
}

describe('LibraryPicker', () => {
  it('plusieurs : rend les images dans l’ordre des désignations', async () => {
    const { picker, closed } = await setup({ already: [] });
    picker['toggle']('b');
    picker['toggle']('a');
    picker['confirm']();
    expect(closed[0]?.map((picked) => picked.url)).toEqual(['b', 'a']);
  });

  it('une seule : désigner remplace la désignation précédente', async () => {
    const { picker, closed } = await setup({ already: [], single: true });
    picker['toggle']('a');
    picker['toggle']('b');
    picker['confirm']();
    expect(closed[0]?.map((picked) => picked.url)).toEqual(['b']);
  });

  it('ne rend jamais de texte alternatif : le porteur décide du sien', async () => {
    const { picker, closed } = await setup({ already: [], single: true });
    picker['toggle']('a');
    picker['confirm']();
    expect(closed[0]?.[0]).not.toHaveProperty('alt');
  });

  it('lit la suite par CURSEUR, jamais par décalage', async () => {
    const { picker, requests } = await setup({ already: [] }, [
      { items: [image('a')], total: 2, next: 'c1' },
      { items: [image('b')], total: 2, next: null },
    ]);
    expect(picker['hasMore']()).toBe(true);

    await picker['more']();

    expect(picker['images']().map((kept) => kept.url)).toEqual(['a', 'b']);
    expect(requests.map((request) => request.after)).toEqual([undefined, 'c1']);
    expect(requests.some((request) => 'offset' in request)).toBe(false);
    expect(picker['hasMore']()).toBe(false);
  });

  it('une recherche repart du début, sans curseur', async () => {
    const { picker, requests } = await setup({ already: [] }, [
      { items: [image('a')], total: 2, next: 'c1' },
      { items: [image('z')], total: 1, next: null },
    ]);
    picker['search'].set('croissant');

    await picker['research']();

    expect(requests.at(-1)).toEqual({ limit: 100, q: 'croissant' });
    expect(picker['images']().map((kept) => kept.url)).toEqual(['z']);
    expect(picker['hasMore']()).toBe(false);
  });
});
