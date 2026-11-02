import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ShelfStockTodayView } from '@lfd/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientAudience } from '../client-audience.service';
import { OrderContextStore, type OrderDraft, type ServiceChoice } from '../order-context.store';
import { PickupListGateway, VISITOR } from './pickup-list.gateway';
import { ShopClock } from './shop-clock';
import { exceedsShelf, parisDayOf, ShelfStockToday } from './shelf-stock-today.store';

const NOW = new Date();
const TODAY = parisDayOf(NOW);
/** Un autre jour que celui de la boutique, quelle que soit l'heure du test. */
const TOMORROW = parisDayOf(new Date(NOW.getTime() + 36 * 3_600_000));

const VIEW: ShelfStockTodayView = [
  { sku: 'croissant', saleUnit: 'piece', left: 3 },
  { sku: 'comte', saleUnit: 'weight', left: 1200 },
];

function pickup(date: string): ServiceChoice {
  return {
    mode: 'pickup',
    pickupAddressId: 'pick_village',
    place: 'Le Village',
    at: 'au Village',
    address: '',
    slot: '',
    window: null,
    date,
  };
}

describe('ShelfStockToday — le reste d’aujourd’hui au point choisi (L7)', () => {
  let choice: ReturnType<typeof signal<ServiceChoice | null>>;
  let reader: string;
  let store: ShelfStockToday;
  let http: HttpTestingController;

  function setUp(initial: ServiceChoice | null, readerKey: string): void {
    choice = signal<ServiceChoice | null>(initial);
    reader = readerKey;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthFacade, useValue: { accessToken$: () => of('jeton') } },
        { provide: PickupListGateway, useValue: { readerKey: () => reader } },
        { provide: ClientAudience, useValue: { shown: signal('b2c') } },
        { provide: ShopClock, useValue: { now: signal(NOW) } },
        {
          provide: OrderContextStore,
          useValue: { choice, draft: signal<OrderDraft | null>(null) },
        },
      ],
    });
    store = TestBed.inject(ShelfStockToday);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  }

  beforeEach(() => {
    setUp(null, VISITOR);
  });

  it('hors aujourd’hui : aucune requête, aucune contrainte', () => {
    setUp(pickup(TOMORROW), VISITOR);
    http.expectNone(() => true);
    expect(store.stateOf('croissant')).toBeNull();
  });

  it('un visiteur lit la route publique avec sa clientèle, et un absent est épuisé', async () => {
    setUp(pickup(TODAY), VISITOR);
    const request = http.expectOne((r) =>
      r.url.endsWith('/shelf-stock/today?pickupAddressId=pick_village&audience=public'),
    );
    request.flush(VIEW);
    await Promise.resolve();

    expect(store.stateOf('croissant')).toEqual({ saleUnit: 'piece', left: 3 });
    expect(store.stateOf('comte')).toEqual({ saleUnit: 'weight', left: 1200 });
    expect(store.stateOf('baguette')).toBe('absent');
  });

  it('un client reconnu lit sa route, sans audience : le serveur la décide', async () => {
    setUp(pickup(TODAY), 'perso');
    await Promise.resolve();
    const request = http.expectOne((r) =>
      r.url.endsWith('/shelf-stock/today/mine?pickupAddressId=pick_village'),
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer jeton');
    request.flush([]);
  });

  it('relit après un refus, et oublie le reste quand le jour change', async () => {
    setUp(pickup(TODAY), VISITOR);
    http.expectOne(() => true).flush(VIEW);
    await Promise.resolve();

    store.refresh();
    http.expectOne(() => true).flush([{ sku: 'croissant', saleUnit: 'piece', left: 1 }]);
    await Promise.resolve();
    expect(store.stateOf('croissant')).toEqual({ saleUnit: 'piece', left: 1 });

    choice.set(pickup(TOMORROW));
    TestBed.tick();
    expect(store.stateOf('croissant')).toBeNull();
    http.verify();
  });

  it('une lecture en échec ne contraint rien : la passation reste juge', async () => {
    setUp(pickup(TODAY), VISITOR);
    http.expectOne(() => true).flush('panne', { status: 500, statusText: 'KO' });
    await Promise.resolve();
    expect(store.stateOf('croissant')).toBeNull();
  });
});

describe('exceedsShelf', () => {
  it('bloque au-delà du reste, et tout pour un absent', () => {
    expect(exceedsShelf({ saleUnit: 'piece', left: 3 }, 3)).toBe(false);
    expect(exceedsShelf({ saleUnit: 'piece', left: 3 }, 4)).toBe(true);
    expect(exceedsShelf({ saleUnit: 'weight', left: 1200 }, 1250)).toBe(true);
    expect(exceedsShelf('absent', 1)).toBe(true);
    expect(exceedsShelf(null, 99)).toBe(false);
  });
});
