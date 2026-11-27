import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { OptionGroupView } from '@lfd/pim-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { INTENT_KEY_HEADER } from '../../../shared/gesture-intents';
import { API_BASE_URL } from '../../data/api';
import { OptionGroupStore } from '../option-group.store';

const BASE = 'http://api.test/pim';

const GROUPS: OptionGroupView[] = [
  {
    id: 'og-1',
    name: 'Tranchage',
    archived: false,
    choices: [{ key: 'tranche', label: 'Tranché', audience: 'both', archived: false }],
    products: 2,
  },
  { id: 'og-2', name: 'Ancien', archived: true, choices: [], products: 0 },
];

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      // Serveur : le store ne charge pas tout seul, le test pilote chaque appel.
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: API_BASE_URL, useValue: BASE },
    ],
  });
  return { store: TestBed.inject(OptionGroupStore), http: TestBed.inject(HttpTestingController) };
}

/** Laisse filer les microtâches : l'appel suivant part après un `await`. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('OptionGroupStore', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sépare les groupes en service des archivés', async () => {
    const { store, http } = setup();
    const done = store.reload();
    http.expectOne(`${BASE}/option-groups`).flush(GROUPS);
    await done;
    expect(store.items().map((group) => group.id)).toEqual(['og-1']);
    expect(store.archivedItems().map((group) => group.id)).toEqual(['og-2']);
  });

  it('retient pourquoi la liste est vide', async () => {
    const { store, http } = setup();
    const done = store.reload();
    http
      .expectOne(`${BASE}/option-groups`)
      .flush({ message: 'Référentiel injoignable.' }, { status: 503, statusText: 'KO' });
    await expect(done).rejects.toBeDefined();
    expect(store.loadError()).not.toBeNull();
  });

  it('crée sous une clé d’intention, gardée sur un échec et neuve après un succès', async () => {
    const { store, http } = setup();
    const payload = {
      name: 'Tranchage',
      choices: [{ key: 'tranche', label: 'Tranché', audience: 'both' as const }],
    };

    const failed = store.create(payload);
    const first = http.expectOne(`${BASE}/option-groups`);
    const firstKey = first.request.headers.get(INTENT_KEY_HEADER);
    expect(firstKey).not.toBeNull();
    expect(first.request.body).toEqual(payload);
    first.flush({}, { status: 500, statusText: 'KO' });
    await expect(failed).rejects.toBeDefined();

    const retried = store.create(payload);
    const second = http.expectOne((req) => req.method === 'POST');
    expect(second.request.headers.get(INTENT_KEY_HEADER)).toBe(firstKey);
    second.flush({ id: 'og-1' });
    await tick();
    http.expectOne((req) => req.method === 'GET').flush(GROUPS);
    await expect(retried).resolves.toEqual({ id: 'og-1' });

    const next = store.create(payload);
    const third = http.expectOne((req) => req.method === 'POST');
    expect(third.request.headers.get(INTENT_KEY_HEADER)).not.toBe(firstKey);
    third.flush({ id: 'og-3' });
    await tick();
    http.expectOne((req) => req.method === 'GET').flush(GROUPS);
    await next;
  });

  it('modifie par PUT, archive par DELETE, restaure par POST, et relit à chaque fois', async () => {
    const { store, http } = setup();
    const payload = {
      name: 'Tranchage',
      choices: [{ key: 'tranche', label: 'Tranché', audience: 'pro' as const }],
    };

    const steps: [() => Promise<void>, string, string][] = [
      [() => store.update('og-1', payload), 'PUT', `${BASE}/option-groups/og-1`],
      [() => store.archive('og-1'), 'DELETE', `${BASE}/option-groups/og-1`],
      [() => store.restore('og-1'), 'POST', `${BASE}/option-groups/og-1/restore`],
    ];
    for (const [run, method, url] of steps) {
      const done = run();
      const req = http.expectOne(url);
      expect(req.request.method).toBe(method);
      req.flush({ id: 'og-1' });
      await tick();
      http.expectOne((r) => r.method === 'GET').flush(GROUPS);
      await done;
    }
  });
});
