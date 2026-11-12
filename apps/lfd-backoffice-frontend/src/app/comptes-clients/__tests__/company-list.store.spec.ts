import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompany } from '../admin-company';
import { COMPANY_LIST_MAX_AGE_MS, CompanyListStore } from '../company-cache/company-list.store';
import { companyWritesInterceptor } from '../company-cache/company-writes.interceptor';

const URL = `${B2B_API_BASE}/admin/companies`;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function company(id: string, status: string): AdminCompany {
  return { id, status } as AdminCompany;
}

function setup(): { store: CompanyListStore; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([companyWritesInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { store: TestBed.inject(CompanyListStore), http: TestBed.inject(HttpTestingController) };
}

/** Sert la liste à la requête en attente, et attend que le magasin l'ait rangée. */
async function serve(http: HttpTestingController, rows: readonly AdminCompany[]): Promise<void> {
  await flush();
  http.expectOne(URL).flush(rows);
  await flush();
}

describe('CompanyListStore', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('lit une fois et sert la copie aux lecteurs suivants', async () => {
    const { store, http } = setup();
    const first = store.list();
    await serve(http, [company('c1', 'pending')]);

    await expect(first).resolves.toEqual([company('c1', 'pending')]);
    await expect(store.list()).resolves.toEqual([company('c1', 'pending')]);
    expect(store.companies()).toEqual([company('c1', 'pending')]);
  });

  it('partage UNE requête entre deux lecteurs simultanés', async () => {
    const { store, http } = setup();
    const a = store.list();
    const b = store.list({ maxAgeMs: COMPANY_LIST_MAX_AGE_MS });
    await serve(http, [company('c1', 'pending')]);

    await expect(a).resolves.toEqual([company('c1', 'pending')]);
    await expect(b).resolves.toEqual([company('c1', 'pending')]);
  });

  it('relit après une écriture : écrire puis relire montre l’état neuf', async () => {
    const { store, http } = setup();
    const first = store.list();
    await serve(http, [company('c1', 'pending')]);
    await first;

    const activation = TestBed.inject(AdminCompaniesService).activate('c1');
    await flush();
    http.expectOne(`${URL}/c1/activate`).flush(null);
    await activation;

    const reread = store.list();
    await serve(http, [company('c1', 'active')]);
    await expect(reread).resolves.toEqual([company('c1', 'active')]);
  });

  it('relit aussi après une écriture refusée, qui a pu écrire en partie', async () => {
    const { store, http } = setup();
    const first = store.list();
    await serve(http, [company('c1', 'pending')]);
    await first;

    const activation = TestBed.inject(AdminCompaniesService).activate('c1');
    await flush();
    http.expectOne(`${URL}/c1/activate`).flush(null, { status: 409, statusText: 'Conflict' });
    await expect(activation).rejects.toBeDefined();

    const reread = store.list();
    await serve(http, [company('c1', 'pending')]);
    await reread;
  });

  it('ne garde pas pour fraîche une lecture partie avant une écriture', async () => {
    const { store, http } = setup();
    const before = store.list();
    await flush();
    const pending = http.expectOne(URL);

    const activation = TestBed.inject(AdminCompaniesService).activate('c1');
    await flush();
    http.expectOne(`${URL}/c1/activate`).flush(null);
    await activation;
    pending.flush([company('c1', 'pending')]);
    await before;

    const after = store.list();
    await serve(http, [company('c1', 'active')]);
    await expect(after).resolves.toEqual([company('c1', 'active')]);
  });

  it('relit pour la page au-delà de cinq minutes, pas avant', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { store, http } = setup();
    const first = store.list();
    await serve(http, [company('c1', 'pending')]);
    await first;

    vi.setSystemTime(Date.now() + COMPANY_LIST_MAX_AGE_MS - 1000);
    await expect(store.list({ maxAgeMs: COMPANY_LIST_MAX_AGE_MS })).resolves.toHaveLength(1);

    vi.setSystemTime(Date.now() + 2000);
    // Un lecteur sans exigence d'âge garde la copie…
    await expect(store.list()).resolves.toHaveLength(1);
    // … la page Comptes clients, elle, relit.
    const reopened = store.list({ maxAgeMs: COMPANY_LIST_MAX_AGE_MS });
    await serve(http, [company('c1', 'pending'), company('c2', 'pending')]);
    await expect(reopened).resolves.toHaveLength(2);
  });

  it('un échec est relancé et laisse la copie précédente', async () => {
    const { store, http } = setup();
    const first = store.list();
    await serve(http, [company('c1', 'pending')]);
    await first;

    const write = TestBed.inject(AdminCompaniesService).activate('c1');
    await flush();
    http.expectOne(`${URL}/c1/activate`).flush(null);
    await write;

    const failed = store.list();
    await flush();
    http.expectOne(URL).flush(null, { status: 500, statusText: 'Erreur' });
    await expect(failed).rejects.toBeDefined();
    expect(store.companies()).toEqual([company('c1', 'pending')]);
  });
});
