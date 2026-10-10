import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { operationShelfId } from './operations';
import { ShelfAddress } from './shelf-address';
import { ALL_SHELVES } from './shelves';
import {
  hydrateWith,
  operationCatalogue,
  TEST_OPERATION_KEY,
  TEST_SHELVES,
} from './shop-catalogue.fixture';
import { ShopCatalogue } from './shop-catalogue.store';
import { Shop } from './shop.service';
import { ShopStore } from './shop.store';

describe('ShelfAddress — le rayon dans l’adresse', () => {
  const NOEL_SHELF = operationShelfId(TEST_OPERATION_KEY);
  let router: Router;
  let store: ShopStore;

  async function open(url: string): Promise<void> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'boutique', children: [] }]),
        provideHttpClient(),
        ShopStore,
        Shop,
        ShelfAddress,
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('open'));
    router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    store = TestBed.inject(ShopStore);
    TestBed.inject(ShelfAddress);
    await settle();
  }

  async function settle(): Promise<void> {
    TestBed.tick();
    await TestBed.inject(Router).navigated;
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  it('le paramètre ouvre le rayon de l’opération', async () => {
    await open(`/boutique?rayon=${NOEL_SHELF}`);
    expect(store.shelf()).toBe(NOEL_SHELF);
    expect(router.url).toBe(`/boutique?rayon=${NOEL_SHELF}`);
  });

  it('un rayon de famille s’ouvre aussi', async () => {
    const shelf = TEST_SHELVES[1]?.id ?? '';
    await open(`/boutique?rayon=${shelf}`);
    expect(store.shelf()).toBe(shelf);
  });

  it('un rayon inconnu (opération finie) laisse le rayon par défaut, sans erreur', async () => {
    await open('/boutique?rayon=op:paques-2020');
    expect(store.shelf()).toBe(ALL_SHELVES);
  });

  it('changer de rayon à la main réécrit l’adresse, sans entrée d’historique', async () => {
    await open('/boutique');
    const navigate = vi.spyOn(router, 'navigate');
    const shelf = TEST_SHELVES[0]?.id ?? '';
    TestBed.inject(Shop).browse(shelf);
    await settle();
    expect(router.url).toBe(`/boutique?rayon=${shelf}`);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0]?.[1]?.replaceUrl).toBe(true);
    expect(store.shelf()).toBe(shelf);

    TestBed.inject(Shop).browse(ALL_SHELVES);
    await settle();
    expect(router.url).toBe('/boutique');
  });

  it('un nouveau paramètre ouvre un nouveau rayon', async () => {
    await open('/boutique');
    await router.navigateByUrl(`/boutique?rayon=${NOEL_SHELF}`);
    await settle();
    expect(store.shelf()).toBe(NOEL_SHELF);
  });
});
