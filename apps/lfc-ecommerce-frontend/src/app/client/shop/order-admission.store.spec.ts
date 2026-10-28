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
import { ShopClock } from './shop-clock';

interface Monde {
  readonly authenticated: boolean;
  readonly open: boolean;
  readonly firstDay?: string | null;
}

function setUp({ authenticated, open, firstDay = null }: Monde): {
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
      { provide: ShopClock, useValue: { now: signal(new Date('2026-10-27T08:00:00.000Z')) } },
      { provide: ClientWorkspace, useValue: { current: signal('c1') } },
      {
        provide: OrderOpeningStore,
        useValue: {
          ordersOpen: signal(open),
          firstServiceDay: signal(firstDay),
          reload: () => Promise.resolve(),
        },
      },
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

  describe('le premier jour commandable (lot J4)', () => {
    it('ouverte, date posée : demande pour la personne, et rend SA date', async () => {
      const { store, http } = setUp({ authenticated: true, open: true, firstDay: '2026-10-30' });
      TestBed.tick();
      await settle();
      expect(store.firstServiceDay()).toBe('2026-10-30');

      http
        .expectOne((r) => r.url.endsWith('/order-admission/mine'))
        .flush({ ordersOpen: true, canOrder: true, firstServiceDay: '2026-11-02' });
      await settle();

      expect(store.firstServiceDay()).toBe('2026-11-02');
    });

    it('exemptée : aucune date, même si la clientèle en a une', async () => {
      const { store, http } = setUp({ authenticated: true, open: true, firstDay: '2026-10-30' });
      TestBed.tick();
      await settle();

      http
        .expectOne((r) => r.url.endsWith('/order-admission/mine'))
        .flush({ ordersOpen: true, canOrder: true, firstServiceDay: null });
      await settle();

      expect(store.firstServiceDay()).toBeNull();
    });

    it('invité : la date de la clientèle avant la saisie, celle de l’adresse ensuite', async () => {
      const { store, http } = setUp({ authenticated: false, open: true, firstDay: '2026-10-30' });
      TestBed.tick();
      http.expectNone((r) => r.url.includes('/order-admission'));
      expect(store.firstServiceDay()).toBe('2026-10-30');

      store.guestTyped('camille@visiteur.fr');
      TestBed.tick();
      http
        .expectOne((r) => r.url.endsWith('/order-admission/guest'))
        .flush({ canOrder: true, firstServiceDay: null });
      await settle();

      expect(store.firstServiceDay()).toBeNull();
    });

    it('relire oublie la réponse et redemande', async () => {
      const { store, http } = setUp({ authenticated: true, open: true, firstDay: '2026-10-30' });
      TestBed.tick();
      await settle();
      http
        .expectOne((r) => r.url.endsWith('/order-admission/mine'))
        .flush({ ordersOpen: true, canOrder: true, firstServiceDay: null });
      await settle();

      await store.reload();
      TestBed.tick();
      await settle();
      http
        .expectOne((r) => r.url.endsWith('/order-admission/mine'))
        .flush({ ordersOpen: true, canOrder: true, firstServiceDay: '2026-11-03' });
      await settle();

      expect(store.firstServiceDay()).toBe('2026-11-03');
    });
  });

  describe('earlyAccess', () => {
    async function answered(monde: Monde, answer: object): Promise<OrderAdmissionStore> {
      const { store, http } = setUp(monde);
      TestBed.tick();
      await settle();
      http.expectOne((r) => r.url.endsWith('/order-admission/mine')).flush(answer);
      await settle();
      return store;
    }

    it('exempté d’une date future : accès anticipé avant l’ouverture de ce jour', async () => {
      const store = await answered(
        { authenticated: true, open: true, firstDay: '2026-11-05' },
        { ordersOpen: true, canOrder: true, firstServiceDay: null },
      );
      expect(store.earlyAccess()).toEqual({ kind: 'beforeOpening', day: '2026-11-05' });
    });

    it('non exempté : rien, sa date reste la sienne', async () => {
      const store = await answered(
        { authenticated: true, open: true, firstDay: '2026-11-05' },
        { ordersOpen: true, canOrder: true, firstServiceDay: '2026-11-05' },
      );
      expect(store.earlyAccess()).toBeNull();
    });

    it('rien quand la date de la clientèle est déjà atteinte', async () => {
      const store = await answered(
        { authenticated: true, open: true, firstDay: '2026-10-27' },
        { ordersOpen: true, canOrder: true, firstServiceDay: null },
      );
      expect(store.earlyAccess()).toBeNull();
    });

    it('fermée et admis : accès pendant la fermeture', async () => {
      const store = await answered(
        { authenticated: true, open: false },
        { ordersOpen: false, canOrder: true },
      );
      expect(store.earlyAccess()).toEqual({ kind: 'duringClosure' });
    });

    it('ouverte et sans date : rien, et rien n’est demandé', () => {
      const { store, http } = setUp({ authenticated: true, open: true });
      TestBed.tick();
      http.expectNone((r) => r.url.includes('/order-admission'));
      expect(store.earlyAccess()).toBeNull();
    });
  });
});
