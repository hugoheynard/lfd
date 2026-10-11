import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MediaLibraryPageView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { LibrarySearch } from './library-search';
import { MediaImagesApi } from '../data/media-images-api';
import type { MediaPageRequest } from '../rules/media-page-request';

/** Un fonds dont on rend chaque réponse à la main, dans l'ordre qu'on veut. */
class HeldApi {
  readonly asked: MediaPageRequest[] = [];
  private readonly pending: ((page: MediaLibraryPageView) => void)[] = [];

  page(request: MediaPageRequest): Promise<MediaLibraryPageView> {
    this.asked.push(request);
    return new Promise((resolve) => this.pending.push(resolve));
  }

  answer(at: number, page: MediaLibraryPageView): void {
    this.pending[at]?.(page);
  }
}

const EMPTY: MediaLibraryPageView = { items: [], total: 0, next: null };

function mount(api: HeldApi): LibrarySearch {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      LibrarySearch,
      { provide: MediaImagesApi, useValue: api },
    ],
  });
  return TestBed.inject(LibrarySearch);
}

describe('chercher dans le fonds', () => {
  /**
   * Régression : une réponse LENTE à une recherche dépassée remettait
   * `searching` à `false` alors que la dernière était encore en vol — le
   * chargement s'éteignait sur une liste périmée (corrigé le 2026-10-11).
   */
  it('laisse le chargement allumé tant que la DERNIÈRE recherche n’a pas répondu', async () => {
    const api = new HeldApi();
    const search = mount(api);

    const first = search.searchFor('crois');
    const second = search.searchFor('croissant');
    api.answer(0, { ...EMPTY, next: 'stale' });
    await first;

    expect(search.searching()).toBe(true);
    expect(search.hasMore()).toBe(false);

    api.answer(1, EMPTY);
    await second;
    expect(search.searching()).toBe(false);
  });

  it('ne lit le fonds d’office qu’une fois', async () => {
    const api = new HeldApi();
    const search = mount(api);

    const opened = search.open();
    api.answer(0, EMPTY);
    await opened;
    await search.open();

    expect(api.asked).toHaveLength(1);
  });
});
