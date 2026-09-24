import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../../data/api';
import { OperationsService } from '../operations.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: '/api/pim' },
    ],
  });
  return {
    api: TestBed.inject(OperationsService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('OperationsService', () => {
  it('écrit chaque sujet sur sa propre route', async () => {
    const { api, http } = setup();

    const presentation = api.editPresentation('noel-2026', {
      name: { fr: 'Noël' },
      lede: null,
      image: null,
    });
    const put = http.expectOne('/api/pim/operations/noel-2026/presentation');
    expect(put.request.method).toBe('PUT');
    put.flush(null);
    await presentation;

    const selection = api.setSelection('noel-2026', ['BUCHE-1', 'GALETTE-1']);
    const sel = http.expectOne('/api/pim/operations/noel-2026/selection');
    expect(sel.request.body).toEqual({ skus: ['BUCHE-1', 'GALETTE-1'] });
    sel.flush(null);
    await selection;

    const audience = api.setAudience('noel-2026', 'pro');
    const aud = http.expectOne('/api/pim/operations/noel-2026/audience');
    expect(aud.request.body).toEqual({ audience: 'pro' });
    aud.flush(null);
    await audience;

    const archive = api.archive('noel-2026');
    const arc = http.expectOne('/api/pim/operations/noel-2026/archive');
    expect(arc.request.method).toBe('PUT');
    arc.flush(null);
    await archive;

    http.verify();
  });

  it('prépare par un POST et rend la clé', async () => {
    const { api, http } = setup();
    const created = api.prepare({
      key: 'noel-2026',
      name: { fr: 'Noël' },
      lede: null,
      image: null,
      audience: 'both',
      announceFrom: '2026-10-31T23:00:00.000Z',
      orderFrom: null,
      orderUntil: '2026-12-21T11:00:00.000Z',
      pickupFrom: '2026-12-23',
      pickupUntil: '2026-12-24',
    });
    const post = http.expectOne('/api/pim/operations');
    expect(post.request.method).toBe('POST');
    post.flush({ key: 'noel-2026' });
    await expect(created).resolves.toEqual({ key: 'noel-2026' });
    http.verify();
  });
});
