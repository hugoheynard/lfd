import { DOCUMENT } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClientCart } from '../cart/client-cart.service';
import { ShelfRefreshOnReturn } from './shelf-refresh-on-return.service';
import { ShopCatalogue } from './shop-catalogue.store';

/** Lot C4 (2026-11-04) : relire au retour sur l'onglet, panier vide seulement. */
describe('ShelfRefreshOnReturn — la photo relue au retour, panier vide', () => {
  const empty = signal(true);
  const visibility = { visibilityState: 'visible' as DocumentVisibilityState };
  let refreshes = 0;
  let service: ShelfRefreshOnReturn;

  beforeEach(() => {
    empty.set(true);
    visibility.visibilityState = 'visible';
    refreshes = 0;
    TestBed.configureTestingModule({
      providers: [
        { provide: ClientCart, useValue: { isEmpty: empty } },
        {
          provide: ShopCatalogue,
          useValue: {
            refreshIfStale: (): Promise<void> => {
              refreshes += 1;
              return Promise.resolve();
            },
          },
        },
        {
          provide: DOCUMENT,
          useValue: {
            get visibilityState(): DocumentVisibilityState {
              return visibility.visibilityState;
            },
            addEventListener: (): void => undefined,
            removeEventListener: (): void => undefined,
          },
        },
      ],
    });
    service = TestBed.inject(ShelfRefreshOnReturn);
  });

  it('onglet visible, panier vide : la photo se relit', () => {
    service.onVisibilityChange();

    expect(refreshes).toBe(1);
  });

  it('panier non vide : rien ne bouge sous un client qui choisit', () => {
    empty.set(false);

    service.onVisibilityChange();

    expect(refreshes).toBe(0);
  });

  it('onglet qui se cache : rien', () => {
    visibility.visibilityState = 'hidden';

    service.onVisibilityChange();

    expect(refreshes).toBe(0);
  });
});
