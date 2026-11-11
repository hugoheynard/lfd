import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CustomerShelfPricesView } from '@lfd/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { AdminCatalogService } from '../catalog.service';

describe('AdminCatalogService.shelfPricesOf', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lit la table des prix du rayon de la société, identifiant encodé', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(AdminCatalogService);
    const http = TestBed.inject(HttpTestingController);
    const view: CustomerShelfPricesView = { items: [], audience: 'pro' };

    const read = service.shelfPricesOf('co/1');
    const request = http.expectOne(`${B2B_API_BASE}/admin/catalog/companies/co%2F1/shelf-prices`);
    expect(request.request.method).toBe('GET');
    request.flush(view);

    await expect(read).resolves.toEqual(view);
  });
});
