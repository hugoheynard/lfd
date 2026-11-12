import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CustomerSheetView } from '@lfd/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import { companyWritesInterceptor } from '../../comptes-clients/company-cache/company-writes.interceptor';
import { ClientSheetStore } from '../client-sheet.store';

const URL = `${B2B_API_BASE}/admin/companies`;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sheet(enseigne: string): CustomerSheetView {
  return { enseigne, raisonSociale: '' } as CustomerSheetView;
}

function setup(): { store: ClientSheetStore; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([companyWritesInterceptor])),
      provideHttpClientTesting(),
      ClientSheetStore,
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  return { store: TestBed.inject(ClientSheetStore), http };
}

/** Sert la fiche à la requête en attente, quelle que soit sa route exacte. */
async function serve(http: HttpTestingController, body: CustomerSheetView): Promise<void> {
  await flush();
  http.expectOne((request) => request.method === 'GET' && request.url.includes('/c1/')).flush(body);
  await flush();
}

describe('ClientSheetStore — une lecture pour la coquille et ses vues', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('sert à une vue la fiche que la coquille a lue', async () => {
    const { store, http } = setup();
    const load = store.load('c1');
    await serve(http, sheet('Chez Léa'));
    await load;

    await expect(store.read('c1')).resolves.toEqual(sheet('Chez Léa'));
  });

  it('une vue qui arrive pendant la lecture attend la même requête', async () => {
    const { store, http } = setup();
    const load = store.load('c1');
    const read = store.read('c1');
    await serve(http, sheet('Chez Léa'));
    await load;

    await expect(read).resolves.toEqual(sheet('Chez Léa'));
    expect(store.state()).toBe('ready');
  });

  it('relit après une écriture du back-office', async () => {
    const { store, http } = setup();
    const load = store.load('c1');
    await serve(http, sheet('Chez Léa'));
    await load;

    const write = TestBed.inject(AdminCompaniesService).activate('c1');
    await flush();
    http.expectOne(`${URL}/c1/activate`).flush(null);
    await write;

    const read = store.read('c1');
    await serve(http, sheet('Chez Lou'));
    await expect(read).resolves.toEqual(sheet('Chez Lou'));
    expect(store.sheet()).toEqual(sheet('Chez Lou'));
  });

  it('un échec de lecture est relancé à la vue, et laisse la fiche précédente', async () => {
    const { store, http } = setup();
    const load = store.load('c1');
    await serve(http, sheet('Chez Léa'));
    await load;

    const write = TestBed.inject(AdminCompaniesService).activate('c1');
    await flush();
    http.expectOne(`${URL}/c1/activate`).flush(null);
    await write;

    const read = store.read('c1');
    await flush();
    http
      .expectOne((request) => request.method === 'GET' && request.url.includes('/c1/'))
      .flush(null, { status: 500, statusText: 'Erreur' });
    await expect(read).rejects.toBeDefined();
    expect(store.state()).toBe('error');
    expect(store.sheet()).toEqual(sheet('Chez Léa'));
  });
});
