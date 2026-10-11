import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { MediaSeriesApi } from './media-series-api';

const BASE = `${B2B_API_BASE}/media/series`;
const PAYLOAD = { title: 'Shooting', shotOn: '2026-03-14', note: null };

describe('MediaSeriesApi', () => {
  let api: MediaSeriesApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(MediaSeriesApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('lit les séries dans l’ordre du serveur', async () => {
    const pending = api.series();
    http.expectOne(BASE).flush([]);

    expect(await pending).toEqual([]);
  });

  it('ouvre une série et rend son identifiant', async () => {
    const pending = api.openSeries(PAYLOAD);
    const post = http.expectOne(BASE);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(PAYLOAD);
    post.flush({ id: 'ser_1' });

    expect(await pending).toBe('ser_1');
  });

  it('corrige une série sous son identifiant encodé', async () => {
    const pending = api.describeSeries('ser/1', PAYLOAD);
    const put = http.expectOne(`${BASE}/ser%2F1`);
    expect(put.request.method).toBe('PUT');
    put.flush(null);
    await pending;
  });
});
