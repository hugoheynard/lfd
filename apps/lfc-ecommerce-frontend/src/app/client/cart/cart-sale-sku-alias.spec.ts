import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ShopCatalogueView } from '@lfd/contracts';

import { CartStore } from './cart.store';
import { ClientCart } from './client-cart.service';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';

/**
 * **Le panier du navigateur devant une ancienne référence**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 5, L2) :
 * normalisé AVANT `keepOnly`, qui sinon le viderait en silence.
 */

const P_X = new Map([['P-X', 'P-X-1']]);

describe('CartStore.normalize', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('un panier P-X ressort en P-X-1, et n’est pas élagué', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('P-X', 2, undefined, 'piece');

    store.normalize(P_X);
    store.keepOnly(new Set(['P-X-1']));

    expect(store.quantities()).toEqual({ 'P-X-1': 2 });
    expect(store.units()).toEqual({ 'P-X-1': 'piece' });
  });

  it('deux graphies du même article s’additionnent ; l’unité de la cible l’emporte', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('P-X', 2, undefined, 'weight');
    store.setQuantity('P-X-1', 3, undefined, 'piece');

    store.normalize(P_X);

    expect(store.quantities()).toEqual({ 'P-X-1': 5 });
    expect(store.units()).toEqual({ 'P-X-1': 'piece' });
  });

  it('sans alias, rien ne bouge', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('P-X', 2);

    store.normalize(new Map());

    expect(store.quantities()).toEqual({ 'P-X': 2 });
  });
});

describe('Le panier à l’arrivée du catalogue', () => {
  it('normalise avant d’élaguer : la ligne survit sous la nouvelle référence', () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(workspaceDouble()),
      ],
    });
    const [first] = TEST_ITEMS;
    if (first === undefined) {
      throw new Error('catalogue de test vide');
    }
    const catalogue: ShopCatalogueView = {
      ...TEST_CATALOGUE,
      items: [{ ...first, sku: 'P-X-1' }],
      saleSkuAliases: [{ aliasSku: 'P-X', targetSku: 'P-X-1' }],
    };
    TestBed.inject(CartStore).setQuantity('P-X', 2);

    hydrateWith(TestBed.inject(ShopCatalogue), catalogue);
    TestBed.inject(ClientCart);
    TestBed.tick();

    expect(TestBed.inject(CartStore).quantities()).toEqual({ 'P-X-1': 2 });
  });
});
