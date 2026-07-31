import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { SuiteEmbed } from '../../suite-embed/suite-embed';
import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompany } from '../admin-company';

const company: AdminCompany = {
  id: 'company_1',
  reference: 'C-000123',
  raisonSociale: 'Café des Amis',
  enseigne: 'Chez Léa',
  formeJuridique: 'SAS',
  siret: '12345678901234',
  tvaIntracom: 'FR12345678901',
  status: 'pending',
  paymentTerm: 'per_order',
  requestedPaymentTerm: null,
  primaryContact: {
    id: null,
    firstName: 'Léa',
    lastName: 'Martin',
    fonction: 'Gérante',
    email: 'lea@cafedesamis.fr',
    phone: '0102030405',
  },
  kbis: null,
  createdAt: '2026-07-30T10:00:00.000Z',
};

const URL = `${B2B_API_BASE}/admin/companies`;

/** Laisse résoudre le `await requestToken()` avant que la requête HTTP parte. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(token: string | null): { service: AdminCompaniesService; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      AdminCompaniesService,
      { provide: SuiteEmbed, useValue: { requestToken: (): Promise<string | null> => Promise.resolve(token) } },
    ],
  });
  return {
    service: TestBed.inject(AdminCompaniesService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('AdminCompaniesService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('GET /admin/companies et renvoie la liste', async () => {
    const { service, http } = setup(null);
    const promise = service.list();
    await flush();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush([company]);

    await expect(promise).resolves.toEqual([company]);
  });

  it('attache le token staff en en-tête Authorization quand il est fourni', async () => {
    const { service, http } = setup('tok-staff');
    const promise = service.list();
    await flush();

    const req = http.expectOne(URL);
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-staff');
    req.flush([]);
    await promise;
  });

  it("n'envoie aucun Authorization quand le token est null (dev/bypass)", async () => {
    const { service, http } = setup(null);
    const promise = service.list();
    await flush();

    const req = http.expectOne(URL);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
    await promise;
  });
});
