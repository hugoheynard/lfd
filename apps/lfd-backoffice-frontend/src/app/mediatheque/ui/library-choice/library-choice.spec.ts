import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { LibraryMediaView, MediaLibraryPageView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { MediaImagesApi } from '../../data/media-images-api';
import type { MediaPageRequest } from '../../rules/media-page-request';
import { LibrarySearch } from '../../state/library-search';
import { LibraryChoice } from './library-choice';

const CURRENT = 'https://media.test/a.png';

function item(url: string): LibraryMediaView {
  return {
    url,
    name: '',
    tags: [],
    alt: { fr: url },
    focal: null,
    uses: 0,
    depositedAt: '2026-10-04T22:05:00.000Z',
    series: null,
    palette: null,
    width: null,
    height: null,
    bytes: null,
    contentType: null,
  };
}

async function mount(): Promise<{ screen: LibraryChoice; asked: MediaPageRequest[] }> {
  const asked: MediaPageRequest[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      LibrarySearch,
      {
        provide: MediaImagesApi,
        useValue: {
          page: (request: MediaPageRequest): Promise<MediaLibraryPageView> => {
            asked.push(request);
            return Promise.resolve({ items: [item(CURRENT), item('b')], total: 2, next: null });
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LibraryChoice);
  fixture.componentRef.setInput('currentUrl', CURRENT);
  fixture.detectChanges();
  await fixture.whenStable();
  return { screen: fixture.componentInstance, asked };
}

describe('choisir dans le fonds', () => {
  it('cherche dès qu’il s’affiche, et rend l’image désignée', async () => {
    const { screen, asked } = await mount();
    const picked: string[] = [];
    screen.picked.subscribe((image) => picked.push(image.url));

    expect(asked).toHaveLength(1);
    expect(screen['isCurrent'](CURRENT)).toBe(true);
    expect(screen['isCurrent']('b')).toBe(false);

    screen['pick'](item('b'));

    expect(picked).toEqual(['b']);
  });
});
