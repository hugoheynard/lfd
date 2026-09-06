import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PlaceOrderPayload } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../auth/auth.facade';
import { ClientCart } from './cart/client-cart.service';
import { ClientOrders } from './client-orders.service';
import { placeOrder, provideRecognised, RECOGNISED } from './client-orders.fixture';
import { OrderContextStore, type ServiceChoice } from './order-context.store';
import { hydrateWith, TEST_CATALOGUE } from './shop/shop-catalogue.fixture';
import { ShopCatalogue } from './shop/shop-catalogue.store';

const AU_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  date: '2026-09-07',
};

const LIVRE: ServiceChoice = {
  mode: 'delivery',
  place: "Val d'Isère",
  at: "à Val d'Isère",
  address: '12 rue du Four, 73150',
  codePostal: '73150',
  slot: '9 h – 10 h',
  date: '2026-09-07',
  deliveryAddress: {
    label: "Val d'Isère",
    ligne1: '12 rue du Four',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
  },
};

function boot(auth: unknown = RECOGNISED): HttpTestingController {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      auth === RECOGNISED ? provideRecognised() : { provide: AuthFacade, useValue: auth },
    ],
  });
  hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  return TestBed.inject(HttpTestingController);
}

/** La charge réellement envoyée, sans la relire du réseau deux fois. */
function sentBody(http: HttpTestingController): PlaceOrderPayload {
  const request = http.expectOne((r) => r.url.endsWith('/orders'));
  const body = request.request.body as PlaceOrderPayload;
  request.flush({ id: 'ord_1', orderNumber: 'CMD-0007' });
  return body;
}

/**
 * 🔴 **La commande part enfin au serveur.**
 *
 * `place()` fabriquait une référence dans le navigateur et écrivait dans le
 * `localStorage`. Tout ce que la chaîne de prix avait construit — le devis
 * serveur, le panier en base, les prix résolus — s'arrêtait **une case avant**
 * l'écriture, et l'écran de confirmation le masquait.
 */
describe('passer commande', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('envoie le point de RETRAIT et la journée, jamais les libellés d’écran', async () => {
    const http = boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');

    const placing = TestBed.inject(ClientOrders).place();
    await Promise.resolve();
    await Promise.resolve();
    const body = sentBody(http);
    await placing;

    expect(body.fulfillmentMethod).toBe('pickup');
    expect(body.pickupAddressId).toBe('pick_labo');
    expect(body.requestedDeliveryDate).toBe('2026-09-07');
    expect(body.companyId).toBeNull();
    expect(body.lines).toEqual([{ sku: 'VIE-001', quantity: 1 }]);
    // Les mots d'écran ne traversent pas : « au Labo » et « 7 h – 8 h » ne sont
    // pas des faits que le serveur puisse recouper.
    expect(JSON.stringify(body)).not.toContain('au Labo');
    expect(JSON.stringify(body)).not.toContain('7 h');
  });

  it('envoie l’adresse COMPLÈTE en livraison — le code postal ne livre pas', async () => {
    const http = boot();
    TestBed.inject(OrderContextStore).choice.set(LIVRE);
    TestBed.inject(ClientCart).add('VIE-001');

    const placing = TestBed.inject(ClientOrders).place();
    await Promise.resolve();
    await Promise.resolve();
    const body = sentBody(http);
    await placing;

    expect(body.fulfillmentMethod).toBe('delivery');
    expect(body.pickupAddressId).toBeNull();
    expect(body.deliveryAddress?.ligne1).toBe('12 rue du Four');
    expect(body.deliveryAddress?.ville).toBe("Val d'Isère");
  });

  /** Le numéro vient du SERVEUR : c'est celui qu'on lira au téléphone. */
  it('garde le numéro rendu par le serveur, pas un compteur local', async () => {
    boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');

    const order = await placeOrder('CMD-0042');

    expect(order?.reference).toBe('CMD-0042');
    expect(TestBed.inject(ClientCart).isEmpty()).toBe(true);
  });

  /**
   * 🔴 **Un refus ne fige rien.** Heure limite dépassée, zone non livrée, SKU
   * disparu : le panier reste plein et le client peut corriger. Le vider lui
   * ferait perdre sa saisie pour une raison qu'il n'a pas choisie.
   */
  it('laisse le panier intact quand le serveur refuse', async () => {
    const http = boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');

    const placing = TestBed.inject(ClientOrders).place();
    await Promise.resolve();
    await Promise.resolve();
    http
      .expectOne((r) => r.url.endsWith('/orders'))
      .flush({ message: 'Heure limite dépassée.' }, { status: 409, statusText: 'Conflict' });

    expect(await placing).toBeNull();
    expect(TestBed.inject(ClientCart).isEmpty()).toBe(false);
  });

  /**
   * Se connecter n'est pas un échec : la boutique se visite sans compte, une
   * commande a un propriétaire. Rien ne part, et le panier survit.
   */
  it('n’appelle rien quand personne n’est reconnu', async () => {
    const http = boot({ isAuthenticated: () => false });
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');

    expect(await TestBed.inject(ClientOrders).place()).toBeNull();

    http.verify();
    expect(TestBed.inject(ClientCart).isEmpty()).toBe(false);
  });
});
