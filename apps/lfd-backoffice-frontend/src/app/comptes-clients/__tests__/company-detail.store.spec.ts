import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { B2B_API_BASE } from '../../api/api-config';
import { AdminCompaniesService } from '../admin-companies.service';
import type { AdminCompanyDetail } from '../admin-company';
import { AdminCompanyHierarchyService } from '../admin-company-hierarchy.service';
import {
  COMPANY_DETAIL_MAX_ENTRIES,
  CompanyDetailStore,
} from '../company-cache/company-detail.store';
import { CompanyWrites } from '../company-cache/company-writes';
import { COMPANY_LIST_MAX_AGE_MS } from '../company-cache/company-list.store';
import { companyWritesInterceptor } from '../company-cache/company-writes.interceptor';

const URL = `${B2B_API_BASE}/admin/companies`;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function detail(id: string, enseigne: string): AdminCompanyDetail {
  return { id, enseigne } as AdminCompanyDetail;
}

function setup(): { store: CompanyDetailStore; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([companyWritesInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { store: TestBed.inject(CompanyDetailStore), http: TestBed.inject(HttpTestingController) };
}

async function serve(
  http: HttpTestingController,
  id: string,
  body: AdminCompanyDetail,
): Promise<void> {
  await flush();
  http.expectOne(`${URL}/${id}`).flush(body);
  await flush();
}

describe('CompanyDetailStore', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.useRealTimers();
  });

  it('partage une lecture entre la fiche, la facturation et la hiérarchie', async () => {
    const { store, http } = setup();
    const hierarchy = TestBed.inject(AdminCompanyHierarchyService);
    const a = store.get('c1');
    const b = store.get('c1');
    const c = hierarchy.hierarchyOf('c1');
    await serve(http, 'c1', detail('c1', 'Chez Léa'));

    await expect(a).resolves.toEqual(detail('c1', 'Chez Léa'));
    await expect(b).resolves.toEqual(detail('c1', 'Chez Léa'));
    // Une seule requête servie (`expectOne`) : la hiérarchie a lu la même.
    await expect(c).resolves.toBe(detail('c1', 'Chez Léa').hierarchy);
    // Plus tard, toujours la copie.
    await expect(store.get('c1')).resolves.toEqual(detail('c1', 'Chez Léa'));
  });

  it('relit après une écriture de la fiche', async () => {
    const { store, http } = setup();
    const first = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Chez Léa'));
    await first;

    const write = TestBed.inject(AdminCompaniesService).updateIdentity(
      'c1',
      {
        enseigne: 'Chez Lou',
        vatNumber: '',
        raisonSociale: '',
        formeJuridique: '',
        siret: '',
        siren: '',
      },
      null,
    );
    await flush();
    http.expectOne(`${URL}/c1/identity`).flush(null);
    await write;

    const reread = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Chez Lou'));
    await expect(reread).resolves.toEqual(detail('c1', 'Chez Lou'));
  });

  it('relit un compte oublié (entrée dans la fiche)', async () => {
    const { store, http } = setup();
    const first = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Chez Léa'));
    await first;

    store.forget('c1');
    const reread = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Chez Lou'));
    await expect(reread).resolves.toEqual(detail('c1', 'Chez Lou'));
  });

  it('relit au-delà de cinq minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { store, http } = setup();
    const first = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Chez Léa'));
    await first;

    vi.setSystemTime(Date.now() + COMPANY_LIST_MAX_AGE_MS + 1000);
    const reread = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Chez Lou'));
    await expect(reread).resolves.toEqual(detail('c1', 'Chez Lou'));
  });

  it('garde « inconnue » (404) comme une réponse', async () => {
    const { store, http } = setup();
    const first = store.get('nope');
    await flush();
    http.expectOne(`${URL}/nope`).flush(null, { status: 404, statusText: 'Not Found' });
    await expect(first).resolves.toBeUndefined();
    await expect(store.get('nope')).resolves.toBeUndefined();
  });
  it('oublie la fiche la moins récemment servie au-delà de la borne', async () => {
    const { store, http } = setup();
    for (let index = 0; index < COMPANY_DETAIL_MAX_ENTRIES; index += 1) {
      const read = store.get(`c${String(index)}`);
      await serve(http, `c${String(index)}`, detail(`c${String(index)}`, 'X'));
      await read;
    }
    // c0 resservie : elle repasse devant, c1 devient la plus ancienne.
    await expect(store.get('c0')).resolves.toEqual(detail('c0', 'X'));
    const extra = store.get('c-new');
    await serve(http, 'c-new', detail('c-new', 'Y'));
    await extra;

    await expect(store.get('c0')).resolves.toEqual(detail('c0', 'X'));
    const reread = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Z'));
    await expect(reread).resolves.toEqual(detail('c1', 'Z'));
  });

  it('relit après un changement venu d’un autre poste (le veilleur)', async () => {
    const { store, http } = setup();
    const first = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Chez Léa'));
    await first;

    TestBed.inject(CompanyWrites).changedElsewhere();
    const reread = store.get('c1');
    await serve(http, 'c1', detail('c1', 'Chez Lou'));
    await expect(reread).resolves.toEqual(detail('c1', 'Chez Lou'));
  });
});
