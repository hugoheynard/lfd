import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { ClientAudience } from '../client-audience.service';
import { OrderOpeningStore } from './order-opening.store';

/** La clientèle de l'écran : connue (`b2b`/`b2c`) ou pas encore (`null`). */
function setUp(audience: 'b2b' | 'b2c' | null): {
  store: OrderOpeningStore;
  http: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ClientAudience, useValue: { current: signal(audience) } },
    ],
  });
  return { store: TestBed.inject(OrderOpeningStore), http: TestBed.inject(HttpTestingController) };
}

describe('OrderOpeningStore', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lit le réglage public, et ferme la clientèle qu’il ferme', async () => {
    const { store, http } = setUp('b2c');

    const reading = store.hydrate();
    http
      .expectOne((r) => r.url.endsWith('/order-opening'))
      .flush({ ordersOpenToB2b: true, ordersOpenToB2c: false });
    await reading;

    expect(store.ordersOpen()).toBe(false);
  });

  it('reste ouvert tant que le réglage n’est pas lu, et après un échec', async () => {
    const { store, http } = setUp('b2c');
    expect(store.ordersOpen()).toBe(true);

    const reading = store.hydrate();
    http
      .expectOne((r) => r.url.endsWith('/order-opening'))
      .flush('panne', { status: 503, statusText: 'Service Unavailable' });
    await reading;

    expect(store.ordersOpen()).toBe(true);
  });

  it('ne dit pas « fermé » tant que la clientèle n’est pas connue', () => {
    const { store } = setUp(null);

    store.receive({ ordersOpenToB2b: false, ordersOpenToB2c: false });

    expect(store.ordersOpen()).toBe(true);
  });

  it('applique la case de la clientèle', () => {
    const { store } = setUp('b2b');

    store.receive({ ordersOpenToB2b: false, ordersOpenToB2c: true });

    expect(store.ordersOpen()).toBe(false);
  });
});
