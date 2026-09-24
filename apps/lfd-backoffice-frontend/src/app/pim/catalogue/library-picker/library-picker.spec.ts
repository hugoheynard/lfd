import { TestBed } from '@angular/core/testing';
import type { LibraryMediaView } from '@lfd/pim-contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { MediaLibraryHttpApi } from '../../../mediatheque/media-library-http-api';
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
    width: 800,
    height: 600,
    bytes: 1000,
    contentType: 'image/jpeg',
  };
}

async function setup(data: LibraryPickerData) {
  const closed: (readonly PickedMedia[] | undefined)[] = [];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: FoldPanelRef,
        useValue: { close: (value?: readonly PickedMedia[]) => closed.push(value) },
      },
      {
        provide: MediaLibraryHttpApi,
        useValue: { page: async () => ({ items: [image('a'), image('b')], total: 2 }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(LibraryPicker);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  const picker = fixture.componentInstance;
  await vi.waitFor(() => expect(picker['loading']()).toBe(false));
  return { picker, closed };
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
});
