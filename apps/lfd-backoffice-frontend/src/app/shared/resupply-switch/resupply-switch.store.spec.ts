import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { ResupplySwitchStore } from './resupply-switch.store';

const URL_SUFFIX = '/admin/resupply-switch';

let granted: StaffPermission[];

function boot(): { store: ResupplySwitchStore; http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: PermissionsStore,
        useValue: {
          ensureLoaded: () => Promise.resolve(),
          can: (permission: StaffPermission) => granted.includes(permission),
        } satisfies Pick<PermissionsStore, 'ensureLoaded' | 'can'>,
      },
    ],
  });
  return {
    store: TestBed.inject(ResupplySwitchStore),
    http: TestBed.inject(HttpTestingController),
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
}

describe('ResupplySwitchStore', () => {
  beforeEach(() => {
    granted = ['handover_counter:read'];
  });

  it('est éteint tant qu’il n’a pas été lu, puis suit la vue servie', async () => {
    const { store, http } = boot();
    expect(store.enabled()).toBe(false);

    const loading = store.ensureLoaded();
    await flushMicrotasks();
    http
      .expectOne((request) => request.url.endsWith(URL_SUFFIX))
      .flush({ enabled: true, updatedAt: null, updatedBy: null });
    await loading;

    expect(store.enabled()).toBe(true);
  });

  it('ne lit qu’une fois', async () => {
    const { store, http } = boot();
    const first = store.ensureLoaded();
    const second = store.ensureLoaded();
    await flushMicrotasks();
    http
      .expectOne((request) => request.url.endsWith(URL_SUFFIX))
      .flush({ enabled: true, updatedAt: null, updatedBy: null });
    await Promise.all([first, second]);
    await store.ensureLoaded();
    http.verify();
  });

  it('reste éteint sur un échec, le dit, et relit au prochain appel', async () => {
    const { store, http } = boot();
    const loading = store.ensureLoaded();
    await flushMicrotasks();
    http
      .expectOne((request) => request.url.endsWith(URL_SUFFIX))
      .flush(null, { status: 500, statusText: 'Erreur' });
    await loading;
    expect(store.enabled()).toBe(false);
    expect(store.loadFailed()).toBe(true);

    const again = store.ensureLoaded();
    await flushMicrotasks();
    http
      .expectOne((request) => request.url.endsWith(URL_SUFFIX))
      .flush({ enabled: true, updatedAt: null, updatedBy: null });
    await again;
    expect(store.enabled()).toBe(true);
    expect(store.loadFailed()).toBe(false);
  });

  it('ne demande rien à un poste qui ne tient aucun droit qui le sert', async () => {
    granted = ['b2b_orders:read'];
    const { store, http } = boot();
    await store.ensureLoaded();
    http.verify();
    expect(store.enabled()).toBe(false);
  });

  it('pose puis relit', async () => {
    const { store, http } = boot();
    const setting = store.set(true);
    const put = http.expectOne((request) => request.method === 'PUT');
    expect(put.request.body).toEqual({ enabled: true });
    put.flush(null, { status: 204, statusText: 'No Content' });
    await flushMicrotasks();
    http
      .expectOne((request) => request.method === 'GET' && request.url.endsWith(URL_SUFFIX))
      .flush({ enabled: true, updatedAt: '2026-11-28T10:00:00.000Z', updatedBy: 'Lou' });
    await setting;
    expect(store.enabled()).toBe(true);
    expect(store.view()?.updatedBy).toBe('Lou');
  });
});
