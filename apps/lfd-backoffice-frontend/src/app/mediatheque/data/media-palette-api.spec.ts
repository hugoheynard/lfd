import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PALETTE_STRIP_LIMITS } from '@lfd/pim-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { ALL_MEDIA } from '../rules/media-feed-url';
import { MediaPaletteApi } from './media-palette-api';

const BASE = `${B2B_API_BASE}/media`;

describe('MediaPaletteApi', () => {
  let api: MediaPaletteApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(MediaPaletteApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('pose la palette d’une image', async () => {
    const palette = [{ hex: '#000000', share: 1, outlier: false }];
    const pending = api.paint('https://media.test/a.png', palette);

    const put = http.expectOne(`${BASE}/palette`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ url: 'https://media.test/a.png', palette });
    put.flush(null);
    await pending;
  });

  it('lit la frise avec les filtres du feed, sans pagination ni tri, colonnes bornées', async () => {
    const pending = api.strip({ ...ALL_MEDIA, tags: ['pain'] }, 10_000);

    const get = http.expectOne((req) => req.url === `${BASE}/palette-strip`);
    expect(get.request.params.get('tags')).toBe('pain');
    expect(get.request.params.has('limit')).toBe(false);
    expect(get.request.params.has('sort')).toBe(false);
    expect(get.request.params.get('columns')).toBe(String(PALETTE_STRIP_LIMITS.maxColumns));
    get.flush({ columns: [], total: 0, unpainted: 0 });

    expect(await pending).toEqual({ columns: [], total: 0, unpainted: 0 });
  });
});
