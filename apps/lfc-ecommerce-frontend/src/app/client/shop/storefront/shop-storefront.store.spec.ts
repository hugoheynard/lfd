import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PublicStorefrontPageView } from '@lfd/contracts';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { AuthFacade } from '../../../auth/auth.facade';
import { provideWorkspace, workspaceDouble } from '../../client-workspace.fixture';
import { ShopStorefront } from './shop-storefront.store';
import { storefrontObject } from './storefront.fixture';

const PAGE: PublicStorefrontPageView = { rows: 2, objects: [storefrontObject({ id: 'noel' })] };

describe('ShopStorefront', () => {
  let store: ShopStorefront;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Un visiteur : la vitrine publique.
        { provide: AuthFacade, useValue: { isAuthenticated: signal(false) } },
      ],
    });
    store = TestBed.inject(ShopStorefront);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lit la page publique du rayon, « Tout » sous la clé `all`', async () => {
    const loading = store.load('all');
    expect(store.stateOf('all')).toEqual({ status: 'loading' });

    http.expectOne((request) => request.url.endsWith('/shop/storefront/all')).flush(PAGE);
    await loading;

    expect(store.stateOf('all')).toEqual({ status: 'ready', page: PAGE });
  });

  it('ne redemande pas une page déjà chargée ou en cours', async () => {
    const first = store.load('cat_pains');
    void store.load('cat_pains');
    http.expectOne((request) => request.url.endsWith('/shop/storefront/cat_pains')).flush(PAGE);
    await first;

    await store.load('cat_pains');
    http.expectNone((request) => request.url.endsWith('/shop/storefront/cat_pains'));
  });

  it('une panne est un état, pas une exception', async () => {
    const loading = store.load('all');
    http
      .expectOne((request) => request.url.endsWith('/shop/storefront/all'))
      .flush('boum', { status: 500, statusText: 'Server Error' });
    await loading;

    expect(store.stateOf('all')).toEqual({ status: 'failed' });
  });

  /** Le rendu serveur attend les requêtes en cours : une vitrine muette ne le retient pas. */
  it('une vitrine qui ne répond pas est tenue pour absente au bout de quatre secondes', async () => {
    vi.useFakeTimers();
    const loading = store.load('all');
    http.expectOne((request) => request.url.endsWith('/shop/storefront/all'));

    await vi.advanceTimersByTimeAsync(4000);
    await loading;

    expect(store.stateOf('all')).toEqual({ status: 'failed' });
  });

  it('un rayon jamais demandé n’a pas d’état', () => {
    expect(store.stateOf('cat_choco')).toBeNull();
  });

  describe('pour un client reconnu', () => {
    const authenticated = signal(true);
    const workspace = workspaceDouble('comp_alpine');

    beforeEach(() => {
      authenticated.set(true);
      workspace.current.set('comp_alpine');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideWorkspace(workspace),
          {
            provide: AuthFacade,
            useValue: { isAuthenticated: authenticated, accessToken$: () => of('jeton') },
          },
        ],
      });
      store = TestBed.inject(ShopStorefront);
      http = TestBed.inject(HttpTestingController);
    });

    /** Une annonce vise une clientèle : la vitrine d'un pro n'est pas celle d'un visiteur. */
    it('lit `/mine`, avec son jeton', async () => {
      const loading = store.load('all');
      const request = http.expectOne((r) => r.url.endsWith('/shop/storefront/all/mine'));
      expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
      request.flush(PAGE);
      await loading;

      expect(store.stateOf('all')).toEqual({ status: 'ready', page: PAGE });
    });

    it('attend que l’espace soit connu, et relit quand il change', async () => {
      workspace.current.set(null);
      await store.load('all');
      http.expectNone((r) => r.url.includes('/shop/storefront/'));
      expect(store.stateOf('all')).toEqual({ status: 'loading' });

      workspace.current.set('comp_alpine');
      const first = store.load('all');
      http.expectOne((r) => r.url.endsWith('/shop/storefront/all/mine')).flush(PAGE);
      await first;

      workspace.current.set('perso');
      expect(store.stateOf('all')).toBeNull();
      const second = store.load('all');
      http.expectOne((r) => r.url.endsWith('/shop/storefront/all/mine')).flush(PAGE);
      await second;
    });

    it('déconnecté, revient à la vitrine publique', async () => {
      authenticated.set(false);
      const loading = store.load('all');
      http.expectOne((r) => r.url.endsWith('/shop/storefront/all')).flush(PAGE);
      await loading;
    });
  });
});
