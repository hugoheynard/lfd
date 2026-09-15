import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_DELIVERY_SETTINGS, type PickupAddressView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { ServicePoints } from './pickup-points.store';

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
    expect(points.deliverySettings()).toEqual(DEFAULT_DELIVERY_SETTINGS);
    expect(points.deliverySettingsKnown()).toBe(false);
  });

  it('lit le réglage avec les points, et tient pour ouverte une clientèle absente', async () => {
    const hydrating = points.hydrate();
    http.expectOne(url('/pickup-addresses')).flush([OLD_POINT]);
    http.expectOne(url('/delivery-zones')).flush([]);
    http.expectOne(url('/fulfillment-days')).flush([]);
    http.expectOne(url('/delivery-settings')).flush({ openToB2c: false });
    await hydrating;

    expect(points.deliverySettings()).toMatchObject({ openToB2b: true, openToB2c: false });
    expect(points.deliverySettingsKnown()).toBe(true);
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
      .expectOne(url('/delivery-settings'))
      .flush({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' });
    await hydrating;

    expect(points.pickups()).toHaveLength(1);
    expect(points.deliverySettings()).toEqual(DEFAULT_DELIVERY_SETTINGS);
    expect(points.deliverySettingsKnown()).toBe(false);
    http.verify();
  });
});
