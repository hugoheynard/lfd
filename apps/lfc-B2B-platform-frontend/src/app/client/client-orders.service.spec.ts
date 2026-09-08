import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { PlaceOrderPayload } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { AuthFacade } from '../auth/auth.facade';
import { ClientCart } from './cart/client-cart.service';
import { ClientOrders } from './client-orders.service';
import {
  CARD_DUE,
  placeOrder,
  placeOrderResponse,
  provideRecognised,
  RECOGNISED,
} from './client-orders.fixture';
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
  window: { start: '07:00', end: '08:00' },
  date: '2026-09-07',
};

const LIVRE: ServiceChoice = {
  mode: 'delivery',
  place: "Val d'Isère",
  at: "à Val d'Isère",
  address: '12 rue du Four, 73150',
  codePostal: '73150',
  slot: '9 h – 10 h',
  // Le dialogue d'adresse n'en envoie AUCUNE — cf. le cas qui l'éprouve.
  window: null,
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
    expect(body.lines).toEqual([{ sku: 'VIE-001', quantity: 1 }]);
    // 🔴 **Aucune société au corps**, et c'est le sujet depuis le 2026-09-08.
    // Le champ a quitté le contrat : la société est résolue au SERVEUR depuis
    // les rattachements du demandeur. Le navigateur ne peut donc plus en nommer
    // une — ni la sienne, ni celle d'un autre.
    expect(JSON.stringify(body)).not.toContain('companyId');
    // Le règlement, lui, se déclare. `null` = le serveur décide comme avant.
    expect(body.settlement).toBeNull();
    // Les mots d'écran ne traversent pas : « au Labo » et « 7 h – 8 h » ne sont
    // pas des faits que le serveur puisse recouper.
    expect(JSON.stringify(body)).not.toContain('au Labo');
    expect(JSON.stringify(body)).not.toContain('7 h');
    // 🔴 La FENÊTRE part, elle : `{ start, end }`, pas « 7 h – 8 h ». Elle ne
    // partait pas du tout — le dialogue avait un vrai `PickupSlot` sous la main
    // et l'aplatissait en libellé à la frontière du store. La commande arrivait
    // donc sans tranche demandée, et le bon de commande n'avait aucune heure à
    // imprimer alors qu'il sait l'afficher.
    expect(body.requestedWindow).toEqual({ start: '07:00', end: '08:00' });
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
    // ⚠️ **Aucune fenêtre en livraison, et c'est le sujet du cas.** Les créneaux
    // de livraison viennent de `DELIVERY_SLOTS`, qui dit lui-même n'affirmer
    // rien de vrai. L'envoyer inscrirait une promesse sur la commande, et le bon
    // de commande l'imprimerait sur un document opposable.
    //
    // 🔴 **ABSENTE, et surtout pas `null`.** Le serveur lit l'absence comme
    // « prends le défaut » — celui du CARNET, que le client a déclaré sur son
    // adresse — et un `null` explicite comme « le client n'en veut aucune ». Ce
    // cas exigeait `toBeNull()` : il aurait laissé passer un `null` qui EFFACE
    // la fenêtre du carnet, ce que la première version faisait vraiment.
    expect(body.requestedWindow).toBeUndefined();
    expect('requestedWindow' in body).toBe(false);
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

/**
 * 🔴 **L'intention de paiement n'était lue par personne.**
 *
 * `POST /orders` rend `payment` quand une carte est requise — et c'est le cas de
 * TOUTE commande du parcours client, qui part sans société. `place()` n'en
 * gardait que le numéro : la commande tombait en `pending` derrière une
 * intention Stripe jamais présentée, et l'écran suivant annonçait « c'est
 * réglé ». Ces cas tiennent la décision qui manquait.
 */
describe('le règlement de la commande', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** Une intention dans la réponse = il reste à payer, et l'écran doit le savoir. */
  it('marque À RÉGLER la commande dont le serveur rend une intention', async () => {
    boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');

    const order = await placeOrderResponse({
      id: 'ord_9',
      orderNumber: 'CMD-0009',
      payment: CARD_DUE,
    });

    expect(order?.settlement).toBe('due');
    expect(order?.id).toBe('ord_9');
  });

  /** Pas d'intention = rien à encaisser : la société règle au terme convenu. */
  it('ne réclame rien quand le serveur ne rend aucune intention', async () => {
    boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');

    const order = await placeOrder('CMD-0010');

    expect(order?.settlement).toBe('not_required');
  });

  /**
   * L'intention reçue à la passation sert l'écran suivant SANS aller-retour —
   * et surtout sans redemander à Stripe un secret qu'on vient de recevoir.
   */
  it('resert l’intention de la passation, sans rappeler le serveur', async () => {
    const http = boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');
    await placeOrderResponse({ id: 'ord_9', orderNumber: 'CMD-0009', payment: CARD_DUE });

    expect(await TestBed.inject(ClientOrders).paymentFor('ord_9')).toEqual(CARD_DUE);
    http.verify();
  });

  /** Une autre commande — un lien rouvert plus tard — se redemande au serveur. */
  it('redemande au serveur l’intention d’une commande qu’il ne tient plus', async () => {
    const http = boot();
    const asking = TestBed.inject(ClientOrders).paymentFor('ord_ancienne');
    await Promise.resolve();
    await Promise.resolve();
    http
      .expectOne((r) => r.url.endsWith('/orders/ord_ancienne/payment'))
      .flush({ ...CARD_DUE, amountCents: 4_200 });

    expect((await asking)?.amountCents).toBe(4_200);
  });

  /**
   * Un refus n'est pas une panne : « cette commande n'attend aucun règlement en
   * ligne » se dit exactement comme « je ne la connais pas ». Dans les deux cas
   * il n'y a pas de carte à demander, et l'écran doit filer à la confirmation.
   */
  it('rend null quand la commande n’attend aucun règlement', async () => {
    const http = boot();
    const asking = TestBed.inject(ClientOrders).paymentFor('ord_reglee');
    await Promise.resolve();
    await Promise.resolve();
    http
      .expectOne((r) => r.url.endsWith('/orders/ord_reglee/payment'))
      .flush({ message: 'Cette commande est déjà réglée.' }, { status: 409, statusText: 'C' });

    expect(await asking).toBeNull();
  });

  /** Le paiement abouti change l'état de CETTE commande, et d'aucune autre. */
  it('passe à RÉGLÉ la commande payée, et elle seule', async () => {
    boot();
    const orders = TestBed.inject(ClientOrders);
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');
    await placeOrderResponse({ id: 'ord_a', orderNumber: 'CMD-A', payment: CARD_DUE });
    TestBed.inject(ClientCart).add('VIE-001');
    await placeOrderResponse({ id: 'ord_b', orderNumber: 'CMD-B', payment: CARD_DUE });

    orders.markPaid('ord_b');

    const bySku = new Map(orders.all().map((row) => [row.id, row.settlement]));
    expect(bySku.get('ord_b')).toBe('paid');
    expect(bySku.get('ord_a')).toBe('due');
  });

  /**
   * 🔴 Une commande écrite AVANT que le règlement existe ne porte ni `id` ni
   * état : lui en poser un ferait dire « réglé » — ou « à régler » — sur la foi
   * de rien. On la laisse tomber du cache ; le serveur, lui, la garde.
   */
  it('écarte du cache une commande relue sans état de règlement', () => {
    localStorage.setItem(
      'orders',
      JSON.stringify([{ reference: 'CMD-VIEILLE', service: {}, totals: {}, lines: [], pieces: 2 }]),
    );
    boot();

    expect(TestBed.inject(ClientOrders).all()).toEqual([]);
  });
});
