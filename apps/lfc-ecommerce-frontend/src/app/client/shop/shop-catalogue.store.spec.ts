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
import { ShopCatalogue } from './shop-catalogue.store';

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
