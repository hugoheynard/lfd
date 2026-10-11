import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MediaLibraryPageView, UploadedMediaView } from '@lfd/pim-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { MediaImagesApi } from './media-images-api';

const BASE = `${B2B_API_BASE}/media`;

describe('MediaImagesApi', () => {
  let api: MediaImagesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(MediaImagesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lit une page avec ses critères, et pas les critères vides', async () => {
    const page: MediaLibraryPageView = { items: [], total: 0, next: null };
    const pending = api.page({ limit: 60, q: '  ', tags: ['pain', 'blé'], after: 'c1' });

    const request = http.expectOne((req) => req.url === BASE);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('limit')).toBe('60');
    expect(request.request.params.get('tags')).toBe('pain,blé');
    expect(request.request.params.get('after')).toBe('c1');
    expect(request.request.params.has('q')).toBe(false);
    request.flush(page);

    expect(await pending).toEqual(page);
  });

  it('lit UNE image par son URL', async () => {
    const pending = api.one('https://media.test/a.png');

    const request = http.expectOne((req) => req.url === `${BASE}/one`);
    expect(request.request.params.get('url')).toBe('https://media.test/a.png');
    request.flush({ url: 'https://media.test/a.png' });

    expect((await pending).url).toBe('https://media.test/a.png');
  });

  it('dépose un fichier avec sa série et sa palette, sans champ quand elles manquent', async () => {
    const file = new File(['octets'], 'a.png', { type: 'image/png' });
    const answer: UploadedMediaView = {
      id: 'med_a',
      url: 'https://media.test/a.png',
      alreadyInLibrary: false,
      seriesId: null,
      width: 10,
      height: 10,
      bytes: 6,
      contentType: 'image/png',
    };

    const withBoth = api.upload(file, 'ser_1', [{ hex: '#ffffff', share: 1, outlier: false }]);
    const first = http.expectOne(BASE);
    const body = first.request.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) {
      throw new Error('pas un formulaire');
    }
    expect(body.get('seriesId')).toBe('ser_1');
    expect(body.get('palette')).toBe('[{"hex":"#ffffff","share":1,"outlier":false}]');
    first.flush(answer);
    await withBoth;

    const bare = api.upload(file);
    const second = http.expectOne(BASE);
    const bareBody = second.request.body;
    if (!(bareBody instanceof FormData)) {
      throw new Error('pas un formulaire');
    }
    expect(bareBody.has('seriesId')).toBe(false);
    expect(bareBody.has('palette')).toBe(false);
    second.flush(answer);
    expect(await bare).toEqual(answer);
  });

  it('décrit, remplace, retire, et lit les refus — chacun sur sa route', async () => {
    const details = { url: 'u', name: 'n', alt: { fr: '' }, focal: null, tags: [] };
    const described = api.describe(details);
    const put = http.expectOne(BASE);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual(details);
    put.flush(null);
    await described;

    const replaced = api.replace({ from: 'a', to: 'b' });
    const post = http.expectOne(`${BASE}/replace`);
    expect(post.request.method).toBe('POST');
    post.flush(null);
    await replaced;

    const discarded = api.discard('a');
    const del = http.expectOne((req) => req.url === BASE && req.method === 'DELETE');
    expect(del.request.params.get('url')).toBe('a');
    del.flush(null);
    await discarded;

    const failures = api.failures();
    const get = http.expectOne((req) => req.url === `${BASE}/failures`);
    expect(get.request.params.get('limit')).toBe('50');
    get.flush([]);
    expect(await failures).toEqual([]);
  });
});
