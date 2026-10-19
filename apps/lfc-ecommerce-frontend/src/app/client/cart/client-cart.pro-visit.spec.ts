import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignInDialog } from '../../login/sign-in-dialog/sign-in-dialog';
import { matchMediaAt } from '../mon-compte/account.fixture';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ProVisit } from '../shop/pro-visit.service';
import { CartStore } from './cart.store';
import { ClientCart } from './client-cart.service';

const SKU = TEST_ITEMS[0]?.sku ?? '';
const OTHER = TEST_ITEMS[1]?.sku ?? '';

/**
 * « Un pro non loggé ne doit pas pouvoir commander » (Hugo, 2026-10-19) : en
 * visite pro, aucun geste n'entre au panier, la connexion s'ouvre à la place,
 * et le panier d'avant est caché — pas vidé.
 */
describe('ClientCart — la visite pro', () => {
  let visit: WritableSignal<boolean>;
  let opened: { readonly component: unknown; readonly data: unknown }[];
  let cart: ClientCart;
  let store: CartStore;

  beforeEach(() => {
    localStorage.clear();
    visit = signal(false);
    opened = [];
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(workspaceDouble()),
        { provide: ProVisit, useValue: { active: visit } },
        {
          provide: FoldPanelHostService,
          useValue: {
            open: (component: unknown, options: { data?: unknown }): { close: () => void } => {
              opened.push({ component, data: options.data });
              return { close: (): void => undefined };
            },
          },
        },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    cart = TestBed.inject(ClientCart);
    store = TestBed.inject(CartStore);
  });

  it('le « + » ouvre la connexion et n’ajoute rien', () => {
    visit.set(true);

    expect(cart.add(SKU)).toBe('signInRequired');
    expect(store.quantityOf(SKU)).toBe(0);
    expect(opened).toEqual([
      { component: SignInDialog, data: { target: '/mon-compte', email: '' } },
    ]);
  });

  it('la fiche (quantité posée) ouvre la connexion et n’ajoute rien', () => {
    visit.set(true);

    expect(cart.setQuantity(SKU, 3)).toBe('signInRequired');
    expect(store.quantityOf(SKU)).toBe(0);
    expect(opened).toHaveLength(1);
  });

  it('un panier d’avant est caché pendant la visite, et revient intact après', () => {
    cart.add(SKU);
    cart.setQuantity(OTHER, 2);
    expect(cart.count()).toBe(3);

    visit.set(true);
    expect(cart.lines()).toEqual([]);
    expect(cart.isEmpty()).toBe(true);
    expect(cart.quantityOf(SKU)).toBe(0);
    // Caché, pas vidé : le dépôt le garde.
    expect(store.quantityOf(OTHER)).toBe(2);

    visit.set(false);
    expect(cart.count()).toBe(3);
    expect(cart.quantityOf(OTHER)).toBe(2);
  });

  it('hors visite pro, rien ne change : l’ajout passe et rien ne s’ouvre', () => {
    expect(cart.add(SKU)).toBe('applied');
    expect(cart.quantityOf(SKU)).toBe(1);
    expect(opened).toEqual([]);
  });
});
