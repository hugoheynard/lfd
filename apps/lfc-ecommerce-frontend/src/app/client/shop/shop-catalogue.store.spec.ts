import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { TEST_CATALOGUE } from './shop-catalogue.fixture';
import { STALE_PHOTO_MS, ShopCatalogue } from './shop-catalogue.store';
import { ShopClock } from './shop-clock';

const PUBLIC_URL = `${AUTH_CONFIG.apiBaseUrl}/shop/catalogue`;

/**
 * Le préchargement depuis Bienvenue (2026-10-18) ne tient que si la boutique
 * RELIT ce que Bienvenue a demandé : un second appel, et l'avance est perdue.
 */
describe('ShopCatalogue — la boutique relit ce que Bienvenue a préchargé', () => {
  let catalogue: ShopCatalogue;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: signal(false), accessToken$: () => of('jeton') },
        },
        provideWorkspace(workspaceDouble()),
      ],
    });
    catalogue = TestBed.inject(ShopCatalogue);
    http = TestBed.inject(HttpTestingController);
  });

  it('arrivée sur la boutique APRÈS la réponse : aucun second appel', async () => {
    const welcome = catalogue.hydrate();
    http.expectOne(PUBLIC_URL).flush(TEST_CATALOGUE);
    await welcome;

    await catalogue.hydrate();

    http.verify();
    expect(catalogue.status()).toBe('ready');
    expect(catalogue.items()).toEqual(TEST_CATALOGUE.items);
  });

  it('arrivée sur la boutique PENDANT la requête : elle attend la même', async () => {
    const welcome = catalogue.hydrate();
    const shop = catalogue.hydrate();

    http.expectOne(PUBLIC_URL).flush(TEST_CATALOGUE);
    await Promise.all([welcome, shop]);

    http.verify();
    expect(catalogue.status()).toBe('ready');
  });
});

/**
 * Lot C4 (2026-11-04) : une photo vieillie se relit — sans s'effacer pendant la
 * relecture, et sans rien perdre si la relecture échoue.
 */
describe('ShopCatalogue — refreshIfStale, la photo relue quand elle a vieilli', () => {
  let catalogue: ShopCatalogue;
  let http: HttpTestingController;
  const now = signal(new Date(2026, 0, 1, 12, 0));

  beforeEach(() => {
    now.set(new Date(2026, 0, 1, 12, 0));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: signal(false), accessToken$: () => of('jeton') },
        },
        provideWorkspace(workspaceDouble()),
        { provide: ShopClock, useValue: { now } },
      ],
    });
    catalogue = TestBed.inject(ShopCatalogue);
    http = TestBed.inject(HttpTestingController);
  });

  async function photographed(): Promise<void> {
    const first = catalogue.hydrate();
    http.expectOne(PUBLIC_URL).flush(TEST_CATALOGUE);
    await first;
  }

  it('une photo récente ne se relit pas', async () => {
    await photographed();
    now.set(new Date(now().getTime() + STALE_PHOTO_MS - 1));

    await catalogue.refreshIfStale();

    http.verify();
  });

  it('une photo vieillie se relit, et la nouvelle remplace l’ancienne', async () => {
    await photographed();
    now.set(new Date(now().getTime() + STALE_PHOTO_MS));
    const fresh = { ...TEST_CATALOGUE, items: TEST_CATALOGUE.items.slice(0, 1) };

    const refresh = catalogue.refreshIfStale();
    expect(catalogue.items()).toEqual(TEST_CATALOGUE.items);
    http.expectOne(PUBLIC_URL).flush(fresh);
    await refresh;

    expect(catalogue.items()).toEqual(fresh.items);
    expect(catalogue.status()).toBe('ready');
  });

  it('une relecture qui échoue garde la photo d’avant', async () => {
    await photographed();
    now.set(new Date(now().getTime() + STALE_PHOTO_MS));

    const refresh = catalogue.refreshIfStale();
    http.expectOne(PUBLIC_URL).flush('panne', { status: 503, statusText: 'Service Unavailable' });
    await refresh;

    expect(catalogue.items()).toEqual(TEST_CATALOGUE.items);
    expect(catalogue.status()).toBe('ready');
  });

  it('sans photo, rien ne part', async () => {
    await catalogue.refreshIfStale();

    http.verify();
  });
});
