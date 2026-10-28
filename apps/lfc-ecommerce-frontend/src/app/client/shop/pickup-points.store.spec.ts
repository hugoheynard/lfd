import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_DELIVERY_AVAILABILITY, type PickupAddressView } from '@lfd/contracts';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { CartStore } from '../cart/cart.store';
import { AuthFacade } from '../../auth/auth.facade';
import {
  provideWorkspace,
  workspaceDouble,
  type WorkspaceDouble,
} from '../client-workspace.fixture';
import { CartFulfillmentDays } from './cart-fulfillment-days.service';
import { ServicePoints } from './pickup-points.store';
import { hydrateWith, operationCatalogue } from './shop-catalogue.fixture';
import { ShopCatalogue } from './shop-catalogue.store';

/** Un point tel qu'une API d'AVANT les remises par clientèle le sert : sans `discounts`. */
const OLD_POINT: Omit<PickupAddressView, 'discounts'> = {
  id: 'pick_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  opening: { proPickup: null, publicOpening: null },
};

/** Un visiteur : la liste des points vient de la route publique. */
const VISITOR_AUTH = {
  provide: AuthFacade,
  useValue: { isAuthenticated: signal(false), accessToken$: () => of('jeton') },
};

const url = (path: string) => (request: { url: string }) => request.url.endsWith(path);

describe('ServicePoints — le réglage de livraison et les vues anciennes', () => {
  let points: ServicePoints;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), VISITOR_AUTH],
    });
    points = TestBed.inject(ServicePoints);
    http = TestBed.inject(HttpTestingController);
  });

  /** Lot J4 : rien ne se propose avant le premier jour commandable de qui regarde. */
  it('relève le premier jour servi au premier jour commandable, sans heure limite', () => {
    points.receive(
      [],
      [],
      [
        { pickupAddressId: 'pick_labo', date: '2026-10-28', orderUntil: '2026-10-27T16:00:00Z' },
        { pickupAddressId: 'pick_village', date: '2026-11-02', orderUntil: null },
      ],
    );
    points.floorDaysAt('2026-10-30');

    expect(points.dayFor('pick_labo')).toMatchObject({
      pickupAddressId: 'pick_labo',
      date: '2026-10-30',
      orderUntil: null,
    });
    expect(points.nextDayFor('pick_village')).toBe('2026-11-02');

    points.floorDaysAt(null);
    expect(points.nextDayFor('pick_labo')).toBe('2026-10-28');
  });

  /** Plan §4 : un front servi avant l'API lit une vue sans les nouveaux champs. */
  it('n’annonce aucune remise pour un point servi sans `discounts`', () => {
    points.receive([OLD_POINT], []);
    expect(points.pickups()[0]?.discounts).toEqual({ b2b: null, b2c: null });
  });

  it('ouvert aux deux, et NON connu, tant que rien n’est lu', () => {
    expect(points.deliveryAvailability()).toEqual(DEFAULT_DELIVERY_AVAILABILITY);
    expect(points.deliveryAvailabilityKnown()).toBe(false);
  });

  it('lit le réglage avec les points, et tient pour ouverte une clientèle absente', async () => {
    const hydrating = points.hydrate();
    http.expectOne(url('/pickup-addresses')).flush([OLD_POINT]);
    http.expectOne(url('/delivery-zones')).flush([]);
    http.expectOne(url('/fulfillment-days')).flush([]);
    http.expectOne(url('/delivery-availability')).flush({ openToB2c: false });
    await hydrating;

    expect(points.deliveryAvailability()).toMatchObject({ openToB2b: true, openToB2c: false });
    expect(points.deliveryAvailabilityKnown()).toBe(true);
    expect(points.pickups()[0]?.discounts).toEqual({ b2b: null, b2c: null });
    http.verify();
  });

  /**
   * Une API sans la route rend 404 : la boutique reste celle d'hier — points
   * servis, livraison ouverte — plutôt que de tout vider pour un réglage absent.
   */
  it('un réglage illisible laisse la livraison ouverte et les points servis', async () => {
    const hydrating = points.hydrate();
    http.expectOne(url('/pickup-addresses')).flush([OLD_POINT]);
    http.expectOne(url('/delivery-zones')).flush([]);
    http.expectOne(url('/fulfillment-days')).flush([]);
    http
      .expectOne(url('/delivery-availability'))
      .flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    await hydrating;

    expect(points.pickups()).toHaveLength(1);
    expect(points.deliveryAvailability()).toEqual(DEFAULT_DELIVERY_AVAILABILITY);
    expect(points.deliveryAvailabilityKnown()).toBe(false);
    http.verify();
  });

  /**
   * D6 : un panier qui porte un article réservé à une opération ne se voit
   * proposer que ses jours de retrait. Les jours se relisent avec ses SKU et la
   * clientèle ; un article courant ne les relit pas.
   */
  it('relit les jours avec les articles d’opération du panier et la clientèle', async () => {
    // Un espace personnel : la clientèle est le public, sans lire `/me`.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideWorkspace(workspaceDouble()),
        provideHttpClient(),
        provideHttpClientTesting(),
        VISITOR_AUTH,
      ],
    });
    points = TestBed.inject(ServicePoints);
    http = TestBed.inject(HttpTestingController);
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('open'));
    const cart = TestBed.inject(CartStore);
    TestBed.inject(CartFulfillmentDays);
    // Le réglage porte le premier jour commandable (lot J4) : aucun ici.
    http.expectOne(url('/order-opening')).flush({ ordersOpenToB2b: true, ordersOpenToB2c: true });
    const hydrating = points.hydrate();
    http.expectOne(url('/pickup-addresses')).flush([OLD_POINT]);
    http.expectOne(url('/delivery-zones')).flush([]);
    http.expectOne(url('/fulfillment-days')).flush([]);
    http.expectOne(url('/delivery-availability')).flush({});
    await hydrating;

    cart.setQuantity('VIE-001', 2);
    TestBed.tick();
    http.expectNone((request) => request.url.includes('/fulfillment-days'));

    cart.setQuantity('PAT-NOE', 1);
    TestBed.tick();
    http
      .expectOne((request) =>
        request.url.endsWith('/fulfillment-days?skus=PAT-NOE&audience=public'),
      )
      .flush([{ pickupAddressId: 'pick_labo', date: '2026-12-20' }]);
    // La réponse traverse deux promesses avant d'être posée.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(points.nextDayFor('pick_labo')).toBe('2026-12-20');
    http.verify();
  });

  /** Le sélecteur d'heure s'arrête au dernier jour de retrait de l'opération du panier. */
  it('borne les jours au plus petit dernier jour des opérations du panier', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideWorkspace(workspaceDouble()),
        provideHttpClient(),
        provideHttpClientTesting(),
        VISITOR_AUTH,
      ],
    });
    points = TestBed.inject(ServicePoints);
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('open'));
    const cart = TestBed.inject(CartStore);
    // Le panier se garde d'une suite à l'autre : on part d'un panier vide.
    cart.clear();
    TestBed.inject(CartFulfillmentDays);

    cart.setQuantity('VIE-001', 2);
    TestBed.tick();
    expect(points.lastDay()).toBeNull();

    cart.setQuantity('PAT-NOE', 1);
    TestBed.tick();
    expect(points.lastDay()).toBe('2026-12-24');

    cart.setQuantity('PAT-NOE', 0);
    TestBed.tick();
    expect(points.lastDay()).toBeNull();
  });
});

/**
 * Hugo, 2026-10-15 : la liste des points est filtrée AU SERVEUR par la
 * clientèle. Un visiteur lit la route publique ; un client reconnu lit
 * `/pickup-addresses/mine`, relue quand il change d'espace.
 */
describe('ServicePoints — la liste des points, par lecteur', () => {
  function boot(authenticated: boolean, workspace: WorkspaceDouble) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(workspace),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: signal(authenticated), accessToken$: () => of('jeton') },
        },
      ],
    });
    return {
      points: TestBed.inject(ServicePoints),
      http: TestBed.inject(HttpTestingController),
    };
  }

  function answerTheRest(http: HttpTestingController): void {
    http.expectOne(url('/delivery-zones')).flush([]);
    http.expectOne(url('/fulfillment-days')).flush([]);
    http.expectOne(url('/delivery-availability')).flush({});
  }

  it('un visiteur lit la route publique', async () => {
    const { points, http } = boot(false, workspaceDouble());
    const hydrating = points.hydrate();
    http.expectOne(url('/pickup-addresses')).flush([OLD_POINT]);
    answerTheRest(http);
    await hydrating;

    expect(points.pickups().map((p) => p.id)).toEqual(['pick_labo']);
    http.verify();
  });

  it('un client reconnu lit les siens, et les relit au changement d’espace', async () => {
    const workspace = workspaceDouble();
    const { points, http } = boot(true, workspace);
    const hydrating = points.hydrate();
    http.expectOne(url('/pickup-addresses/mine')).flush([OLD_POINT]);
    answerTheRest(http);
    await hydrating;
    expect(points.pickups().map((p) => p.id)).toEqual(['pick_labo']);

    workspace.choose('cmp_pro');
    TestBed.tick();
    http.expectOne(url('/pickup-addresses/mine')).flush([{ ...OLD_POINT, id: 'pros' }]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(points.pickups().map((p) => p.id)).toEqual(['pros']);
    http.verify();
  });
});
