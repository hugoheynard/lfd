import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SubscriptionView } from '@lfd/contracts';

import { ClientSubscriptions, type SubscriptionsStatus } from '../../client-subscriptions.service';
import { recurringBasketsCopy } from '../../copy/screens/recurring-baskets.copy';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { BASKET } from '../basket.fixture';
import { BasketsPage } from './baskets-page';

const COPY = recurringBasketsCopy('fr');

const rows = signal<readonly SubscriptionView[]>([]);
const status = signal<SubscriptionsStatus>('idle');
let reloads: number;
let hydrations: number;
let fixture: ComponentFixture<BasketsPage>;
const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

function render(state: SubscriptionsStatus, baskets: readonly SubscriptionView[] = []): void {
  rows.set(baskets);
  status.set(state);
  reloads = 0;
  hydrations = 0;
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BasketsPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ClientSubscriptions,
        useValue: {
          all: rows.asReadonly(),
          status: status.asReadonly(),
          reload: () => {
            reloads += 1;
            return Promise.resolve();
          },
        },
      },
      {
        provide: ShopCatalogue,
        useValue: {
          itemOf: () => null,
          hydrate: () => {
            hydrations += 1;
            return Promise.resolve();
          },
        },
      },
    ],
  });
  fixture = TestBed.createComponent(BasketsPage);
  fixture.detectChanges();
}

describe('BasketsPage', () => {
  it('attend la liste par un chargement fold, et demande le catalogue pour les noms', () => {
    render('idle');

    expect(el().querySelector('fold-loading')).not.toBeNull();
    expect(hydrations).toBe(1);
  });

  it('un échec se dit, et Réessayer relit', () => {
    render('failed');

    expect(el().querySelector('[data-baskets-failed]')).not.toBeNull();
    el().querySelector<HTMLButtonElement>('[data-baskets-failed] button')?.click();
    expect(reloads).toBe(1);
  });

  it('aucun panier : l’état vide le dit', () => {
    render('ready');

    expect(el().querySelector('[data-baskets-none]')).not.toBeNull();
  });

  it('une carte par panier', () => {
    render('ready', [BASKET, { ...BASKET, id: 'sub_2', recurrence: 'monthly' }]);

    expect(el().querySelectorAll('app-basket-card')).toHaveLength(2);
    expect(el().textContent).toContain(COPY.recurrence.monthly);
  });
});
