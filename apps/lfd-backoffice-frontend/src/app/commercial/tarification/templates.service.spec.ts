import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { PriceTemplatesService } from './templates.service';

describe('PriceTemplatesService.archive', () => {
  it('poste sur la route d’archivage du gabarit, identifiant encodé', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(PriceTemplatesService);
    const http = TestBed.inject(HttpTestingController);

    const done = service.archive('tpl/1');
    const request = http.expectOne(`${B2B_API_BASE}/admin/pricing/templates/tpl%2F1/archive`);
    expect(request.request.method).toBe('POST');
    request.flush(null, { status: 204, statusText: 'No Content' });

    await expect(done).resolves.toBeUndefined();
    http.verify();
  });
});

/**
 * Régression : `compose` partait sans `Idempotency-Key`, que la route exige
 * (400) — enregistrer un gabarit neuf échouait toujours.
 */
describe('PriceTemplatesService.compose', () => {
  const payload = { kind: 'mercuriale' as const, label: 'Hôtels', lines: [] };

  function setUp(): { service: PriceTemplatesService; http: HttpTestingController } {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    return {
      service: TestBed.inject(PriceTemplatesService),
      http: TestBed.inject(HttpTestingController),
    };
  }

  it('renvoie la même clé au réessai d’un envoi échoué, une neuve après un succès', async () => {
    const { service, http } = setUp();
    const url = `${B2B_API_BASE}/admin/pricing/templates`;

    const failed = service.compose(payload);
    const first = http.expectOne(url);
    const key = first.request.headers.get('Idempotency-Key');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    first.flush(null, { status: 503, statusText: 'Unavailable' });
    await expect(failed).rejects.toBeDefined();

    const retried = service.compose(payload);
    const second = http.expectOne(url);
    expect(second.request.headers.get('Idempotency-Key')).toBe(key);
    second.flush({ id: 'tpl-1' });
    await expect(retried).resolves.toEqual({ id: 'tpl-1' });

    const again = service.compose(payload);
    const third = http.expectOne(url);
    expect(third.request.headers.get('Idempotency-Key')).not.toBe(key);
    third.flush({ id: 'tpl-2' });
    await again;
    http.verify();
  });
});
