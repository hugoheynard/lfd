import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PublicStorefrontPageView } from '@lfd/contracts';
import { vi } from 'vitest';

import { ShopStorefront } from './shop-storefront.store';
import { storefrontObject } from './storefront.fixture';

const PAGE: PublicStorefrontPageView = { rows: 2, objects: [storefrontObject({ id: 'noel' })] };

describe('ShopStorefront', () => {
  let store: ShopStorefront;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
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
});
