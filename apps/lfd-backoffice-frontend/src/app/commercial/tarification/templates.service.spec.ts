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
