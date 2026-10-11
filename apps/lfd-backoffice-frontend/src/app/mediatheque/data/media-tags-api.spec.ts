import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { MediaTagsApi } from './media-tags-api';

const BASE = `${B2B_API_BASE}/media/tags`;

describe('MediaTagsApi', () => {
  let api: MediaTagsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(MediaTagsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lit le vocabulaire du fonds', async () => {
    const pending = api.tags();
    http.expectOne(BASE).flush([{ tag: 'pain', count: 3 }]);

    expect(await pending).toEqual([{ tag: 'pain', count: 3 }]);
  });

  it('renomme par PUT, et retire un mot par DELETE avec le mot en paramètre', async () => {
    const renamed = api.renameTag({ from: 'pain', to: 'pains' });
    const put = http.expectOne(`${BASE}/rename`);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ from: 'pain', to: 'pains' });
    put.flush(null);
    await renamed;

    const removed = api.removeTag('pain');
    const del = http.expectOne((req) => req.url === BASE && req.method === 'DELETE');
    expect(del.request.params.get('tag')).toBe('pain');
    del.flush(null);
    await removed;
  });
});
