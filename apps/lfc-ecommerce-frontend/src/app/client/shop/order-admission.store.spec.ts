import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientWorkspace } from '../client-workspace.service';
import { OrderAdmissionStore } from './order-admission.store';
import { OrderOpeningStore } from './order-opening.store';

interface Monde {
  readonly authenticated: boolean;
  readonly open: boolean;
}

function setUp({ authenticated, open }: Monde): {
  store: OrderAdmissionStore;
  http: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: AuthFacade,
        useValue: {
          isAuthenticated: signal(authenticated),
          accessToken$: () => of('jeton'),
        },
      },
      { provide: ClientWorkspace, useValue: { current: signal('c1') } },
      { provide: OrderOpeningStore, useValue: { ordersOpen: signal(open) } },
    ],
  });
  return {
    store: TestBed.inject(OrderAdmissionStore),
    http: TestBed.inject(HttpTestingController),
  };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Les exemptions à la fermeture, vues de la boutique (2026-10-26). */
describe('OrderAdmissionStore', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('ne demande rien tant que la boutique est ouverte', () => {
    const { store, http } = setUp({ authenticated: true, open: true });
    TestBed.tick();

    http.expectNone((r) => r.url.includes('/order-admission'));
    expect(store.admitted()).toBe(false);
  });

  it('fermée : admet le client connecté que le serveur dit exempté', async () => {
    const { store, http } = setUp({ authenticated: true, open: false });
    TestBed.tick();
    await settle();

    const ask = http.expectOne((r) => r.url.endsWith('/order-admission/mine'));
    expect(ask.request.headers.get('Authorization')).toBe('Bearer jeton');
    ask.flush({ ordersOpen: false, canOrder: true });
    await settle();

    expect(store.admitted()).toBe(true);
  });

  it('fermée : n’admet pas le client que le serveur dit non exempté', async () => {
    const { store, http } = setUp({ authenticated: true, open: false });
    TestBed.tick();
    await settle();

    http
      .expectOne((r) => r.url.endsWith('/order-admission/mine'))
      .flush({ ordersOpen: false, canOrder: false });
    await settle();

    expect(store.admitted()).toBe(false);
  });

  it('invité : ne demande qu’une fois l’adresse saisie, et pour elle seule', async () => {
    const { store, http } = setUp({ authenticated: false, open: false });
    TestBed.tick();
    http.expectNone((r) => r.url.includes('/order-admission'));

    store.guestTyped(' Camille@Visiteur.fr ');
    TestBed.tick();
    const ask = http.expectOne((r) => r.url.endsWith('/order-admission/guest'));
    expect(ask.request.body).toEqual({ email: 'Camille@Visiteur.fr' });
    ask.flush({ canOrder: true });
    await settle();

    expect(store.admitted()).toBe(true);

    store.guestTyped('autre@visiteur.fr');
    TestBed.tick();
    http.expectOne((r) => r.url.endsWith('/order-admission/guest')).flush({ canOrder: false });
    await settle();

    expect(store.admitted()).toBe(false);
  });

  it('un échec de lecture laisse le bouton caché', async () => {
    const { store, http } = setUp({ authenticated: false, open: false });
    store.guestTyped('camille@visiteur.fr');
    TestBed.tick();

    http
      .expectOne((r) => r.url.endsWith('/order-admission/guest'))
      .flush('trop', { status: 429, statusText: 'Too Many Requests' });
    await settle();

    expect(store.admitted()).toBe(false);
  });
});
