import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CounterCustomerView } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { CommercialOrderEntrySource, CounterOrderEntrySource } from '../order-entry-sources';

/**
 * **Au comptoir, pas une lecture de la fiche client.** Le rôle `comptoir` n'a
 * pas `b2b_companies` : un seul appel à `/admin/companies` y serait un 403, et
 * l'écran tomberait. L'e2e serveur prouve que les lectures du comptoir passent ;
 * ce cas prouve que la saisie ne demande QUE celles-là.
 */

const COUNTER_VIEW: CounterCustomerView = {
  id: 'c1',
  name: 'Boulangerie Périn SARL',
  tradeName: '',
  reference: 'C-1',
  status: 'active',
  settlesOnAccount: false,
  deliveryAddresses: [],
  buyers: [],
};

let http: HttpTestingController;

beforeEach(() => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  http = TestBed.inject(HttpTestingController);
});

afterEach(() => {
  http.verify();
});

describe('CounterOrderEntrySource', () => {
  it('lit le client par la route du comptoir, jamais par /admin/companies', async () => {
    const pending = TestBed.inject(CounterOrderEntrySource).customer('c1');
    http.expectOne(`${B2B_API_BASE}/admin/counter/customers/c1`).flush(COUNTER_VIEW);
    http.expectNone((request) => request.url.includes('/admin/companies'));

    expect((await pending).displayName).toBe('Boulangerie Périn SARL');
  });

  it('lit l’ouverture de la livraison par la route PUBLIQUE, projetée dans la vue complète', async () => {
    const pending = TestBed.inject(CounterOrderEntrySource).deliveryAvailability();
    http
      .expectOne(`${B2B_API_BASE}/delivery-availability`)
      .flush({ openToB2b: false, openToB2c: true });
    http.expectNone(`${B2B_API_BASE}/admin/delivery-availability`);

    expect(await pending).toEqual({
      openToB2b: false,
      openToB2c: true,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it('ne propose pas d’enregistrer une adresse au carnet', () => {
    expect(TestBed.inject(CounterOrderEntrySource).keepsAddresses).toBe(false);
  });
});

describe('CommercialOrderEntrySource', () => {
  it('lit la fiche et ses membres, comme avant', () => {
    void TestBed.inject(CommercialOrderEntrySource).customer('c1');
    http.expectOne(`${B2B_API_BASE}/admin/companies/c1`);
    http.expectOne(`${B2B_API_BASE}/admin/companies/c1/members`);
  });

  it('lit l’ouverture de la livraison par la route admin', () => {
    void TestBed.inject(CommercialOrderEntrySource).deliveryAvailability();
    http.expectOne(`${B2B_API_BASE}/admin/delivery-availability`);
  });
});
