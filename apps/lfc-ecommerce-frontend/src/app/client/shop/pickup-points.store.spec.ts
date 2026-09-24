import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_DELIVERY_AVAILABILITY, type PickupAddressView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { CartStore } from '../cart/cart.store';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';
import { CartFulfillmentDays } from './cart-fulfillment-days.service';
import { ServicePoints } from './pickup-points.store';
import { hydrateWith, operationCatalogue } from './shop-catalogue.fixture';
import { ShopCatalogue } from './shop-catalogue.store';

/** Un point tel qu'une API d'AVANT les clientèles de remise le sert : sans `discountAudiences`. */
const OLD_POINT: Omit<PickupAddressView, 'discountAudiences'> = {
  id: 'pick_labo',
  label: 'Le Labo',
  ligne1: 'Route de la Balme',
  ligne2: '',
  codePostal: '73150',
  ville: 'Val d’Isère',
  pays: 'France',
  isDefault: true,
  discount: { mode: 'percent', bp: 1_000 },
  opening: { proPickup: null, publicOpening: null },
};

const url = (path: string) => (request: { url: string }) => request.url.endsWith(path);

describe('ServicePoints — le réglage de livraison et les vues anciennes', () => {
  let points: ServicePoints;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    points = TestBed.inject(ServicePoints);
    http = TestBed.inject(HttpTestingController);
  });

  /** Plan §4 : un front servi avant l'API lit une vue sans les nouveaux champs. */
  it('tient pour ouvertes les clientèles absentes d’un point', () => {
    points.receive([OLD_POINT], []);
    expect(points.pickups()[0]?.discountAudiences).toEqual({ b2b: true, b2c: true });
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
    expect(points.pickups()[0]?.discountAudiences).toEqual({ b2b: true, b2c: true });
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
      ],
    });
    points = TestBed.inject(ServicePoints);
    http = TestBed.inject(HttpTestingController);
    hydrateWith(TestBed.inject(ShopCatalogue), operationCatalogue('open'));
    const cart = TestBed.inject(CartStore);
    TestBed.inject(CartFulfillmentDays);
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
});
