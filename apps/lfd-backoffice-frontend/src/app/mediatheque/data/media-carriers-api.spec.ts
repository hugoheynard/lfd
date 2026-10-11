import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { MediaCarriersApi } from './media-carriers-api';

describe('MediaCarriersApi', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('nomme les porteurs d’une image, l’URL en paramètre', async () => {
    const pending = TestBed.inject(MediaCarriersApi).carriersOf('https://media.test/a.png');

    const request = http.expectOne((req) => req.url === `${B2B_API_BASE}/media/carriers`);
    expect(request.request.params.get('url')).toBe('https://media.test/a.png');
    request.flush([{ kind: 'product', id: 'p1', label: 'Brioche' }]);

    expect(await pending).toEqual([{ kind: 'product', id: 'p1', label: 'Brioche' }]);
  });
});
