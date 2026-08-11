import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompany, AdminCompanyDetail } from '../admin-company';

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
  owner: null,
  hasOpenSupportRequest: false,
  createdAt: '2026-07-30T10:00:00.000Z',
};

const URL = `${B2B_API_BASE}/admin/companies`;

/**
 * Laisse tourner la micro-tâche avant d'inspecter la requête. Le service part
 * désormais sans attendre de jeton — c'est `staffAuthInterceptor` qui l'attache,
 * et il est testé pour lui-même — mais les méthodes restent asynchrones.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(): {
  service: AdminCompaniesService;
  http: HttpTestingController;
} {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), AdminCompaniesService],
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
    const { service, http } = setup();
    const promise = service.list();
    await flush();

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush([company]);

    await expect(promise).resolves.toEqual([company]);
  });

  it('GET /admin/companies/:id renvoie la fiche détail', async () => {
    const detail: AdminCompanyDetail = {
      ...company,
      vatNumberRequired: true,
      addresses: { billing: null, deliveries: [] },
    };
    const { service, http } = setup();
    const promise = service.getById('company_1');
    await flush();

    const req = http.expectOne(`${URL}/company_1`);
    expect(req.request.method).toBe('GET');
    req.flush(detail);

    await expect(promise).resolves.toEqual(detail);
  });

  it('getById renvoie undefined sur 404 (société inconnue)', async () => {
    const { service, http } = setup();
    const promise = service.getById('company_absente');
    await flush();

    http.expectOne(`${URL}/company_absente`).flush('', { status: 404, statusText: 'Not Found' });

    await expect(promise).resolves.toBeUndefined();
  });

  it('setPaymentTerm PATCH le terme convenu', async () => {
    const { service, http } = setup();
    const promise = service.setPaymentTerm('company_1', 'net90');
    await flush();

    const req = http.expectOne(`${URL}/company_1/payment-term`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ paymentTerm: 'net90' });
    req.flush(null);
    await promise;
  });
});
