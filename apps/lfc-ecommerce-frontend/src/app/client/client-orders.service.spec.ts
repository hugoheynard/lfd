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
import { loyaltyDouble, provideLoyalty, type LoyaltyDouble } from './client-loyalty.fixture';
import { VoucherChoice } from './cart/voucher-choice.service';
import { provideWorkspace, workspaceDouble } from './client-workspace.fixture';
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
  deliveryAddressId: 'adr_four',
  deliveryAddress: {
    label: "Val d'Isère",
    ligne1: '12 rue du Four',
    ligne2: '',
    codePostal: '73150',
    ville: "Val d'Isère",
    pays: 'France',
  },
};

function boot(
  auth: unknown = RECOGNISED,
  loyalty: LoyaltyDouble = loyaltyDouble(),
): HttpTestingController {
  localStorage.clear();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideLoyalty(loyalty),
      provideHttpClient(),
      provideHttpClientTesting(),
      // L'espace connu : sans lui, la passation attend `/me` et ne part pas.
      provideWorkspace(workspaceDouble()),
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

  /**
   * Régression : `payloadOf` envoyait `deliveryAddressId: null` en dur, et la
   * feuille de route disait « adresse non reliée au carnet » pour toutes les
   * livraisons de la boutique (corrigé le 2026-09-29).
   */
  it('la commande de livraison part avec l’id de l’adresse choisie au carnet', async () => {
    const http = boot();
    TestBed.inject(OrderContextStore).choice.set(LIVRE);
    TestBed.inject(ClientCart).add('VIE-001');

    const placing = TestBed.inject(ClientOrders).place();
    await Promise.resolve();
    await Promise.resolve();
    const body = sentBody(http);
    await placing;

    expect(body.deliveryAddressId).toBe('adr_four');
  });

  it('n’envoie aucun id d’adresse en retrait', async () => {
    const http = boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');

    const placing = TestBed.inject(ClientOrders).place();
    await Promise.resolve();
    await Promise.resolve();
    const body = sentBody(http);
    await placing;

    expect(body.deliveryAddressId).toBeNull();
  });

  /** Un visiteur n'a pas de carnet : quoi que porte le choix, rien ne part. */
  it('un visiteur envoie `deliveryAddressId: null`', async () => {
    const http = boot();
    TestBed.inject(OrderContextStore).choice.set(LIVRE);
    TestBed.inject(ClientCart).add('VIE-001');

    const placing = TestBed.inject(ClientOrders).placeAsGuest({
      firstName: 'Jean',
      email: 'jean@example.com',
      phone: '0600000000',
    });
    await Promise.resolve();
    await Promise.resolve();
    const request = http.expectOne((r) => r.url.endsWith('/shop/orders'));
    const body = request.request.body as PlaceOrderPayload;
    request.flush({ id: 'ord_1', orderNumber: 'CMD-0007' });
    await placing;

    expect(body.deliveryAddressId).toBeNull();
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
   * F5 : la confirmation d'un pro au compte ne montre que le HT. Le drapeau se
   * lit sur le régime que le serveur rend, pas sur l'absence d'intention — un
   * total nul n'en a pas non plus.
   */
  it('lit « au compte » sur le régime rendu par le serveur, jamais sur l’absence d’intention', async () => {
    boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');
    const account = await placeOrderResponse({
      id: 'ord_1',
      orderNumber: 'CMD-0011',
      settlement: 'account',
    });
    expect(account?.onAccount).toBe(true);

    TestBed.inject(ClientCart).add('VIE-001');
    const free = await placeOrderResponse({
      id: 'ord_2',
      orderNumber: 'CMD-0012',
      settlement: 'free',
    });
    expect(free).toMatchObject({ settlement: 'not_required', onAccount: false });
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
   * il n'y a pas de carte à demander, et l'écran le dit lui-même.
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

  /**
   * Régression : une panne réseau rendait `null`, et l'écran annonçait « cette
   * commande n'attend plus de paiement » pendant une simple coupure (2026-09-26).
   */
  it('relance une panne au lieu de la faire passer pour un refus', async () => {
    const http = boot();
    const asking = TestBed.inject(ClientOrders).paymentFor('ord_coupee');
    await Promise.resolve();
    await Promise.resolve();
    http
      .expectOne((r) => r.url.endsWith('/orders/ord_coupee/payment'))
      .error(new ProgressEvent('error'), { status: 0, statusText: '' });

    await expect(asking).rejects.toBeDefined();
  });

  it('relance une erreur serveur (5xx)', async () => {
    const http = boot();
    const asking = TestBed.inject(ClientOrders).paymentFor('ord_5xx');
    await Promise.resolve();
    await Promise.resolve();
    http
      .expectOne((r) => r.url.endsWith('/orders/ord_5xx/payment'))
      .flush({ message: 'boum' }, { status: 503, statusText: 'KO' });

    await expect(asking).rejects.toBeDefined();
  });

  /**
   * Le panier suit le règlement (Hugo, 2026-10-09) — régression : il se vidait
   * au clic sur « Commander », et revenir de la page de règlement sans payer
   * rendait un panier vide.
   */
  it('garde le panier d’une commande à régler, et le vide au paiement de CETTE commande', async () => {
    boot();
    const orders = TestBed.inject(ClientOrders);
    const cart = TestBed.inject(ClientCart);
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    cart.add('VIE-001');

    await placeOrderResponse({ id: 'ord_c', orderNumber: 'CMD-C', payment: CARD_DUE });
    expect(cart.isEmpty()).toBe(false);

    orders.markPaid('ord_autre');
    expect(cart.isEmpty()).toBe(false);

    orders.markPaid('ord_c');
    expect(cart.isEmpty()).toBe(true);
  });

  it('vide le panier tout de suite quand rien n’est à encaisser', async () => {
    boot();
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');

    await placeOrder('CMD-0011');

    expect(TestBed.inject(ClientCart).isEmpty()).toBe(true);
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

/** Plan des points, §13, E2.2 et E2.3 : le bon choisi part à la passation. */
describe('passer commande avec un bon de fidélité', () => {
  let loyalty: LoyaltyDouble;

  beforeEach(() => {
    loyalty = loyaltyDouble();
  });

  async function send(): Promise<{
    body: PlaceOrderPayload;
    answer: (status: number) => Promise<unknown>;
  }> {
    const placing = TestBed.inject(ClientOrders).place();
    await Promise.resolve();
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne((r) =>
      r.url.endsWith('/orders'),
    );
    return {
      body: request.request.body as PlaceOrderPayload,
      answer: async (status) => {
        if (status === 201) {
          request.flush({ id: 'ord_1', orderNumber: 'CMD-0007' });
        } else {
          request.flush(
            { code: 'loyalty.voucher_reserved', message: 'Ce bon est déjà utilisé.' },
            { status, statusText: 'Conflict' },
          );
        }
        return placing;
      },
    };
  }

  function ready(): void {
    boot(RECOGNISED, loyalty);
    TestBed.inject(OrderContextStore).choice.set(AU_LABO);
    TestBed.inject(ClientCart).add('VIE-001');
  }

  it('envoie le bon choisi, et n’en envoie aucun sans choix', async () => {
    ready();
    const without = await send();
    expect('voucherId' in without.body).toBe(false);
    await without.answer(409);

    TestBed.inject(VoucherChoice).select('v_available');
    const withVoucher = await send();
    expect(withVoucher.body.voucherId).toBe('v_available');
    await withVoucher.answer(201);
  });

  it('change de clé d’idempotence quand le bon change — c’est une autre commande', async () => {
    ready();
    const first = await send();
    await first.answer(409);
    const replay = await send();
    // Le rejeu du même panier, sans bon : la même tentative.
    expect(replay.body.idempotencyKey).toBe(first.body.idempotencyKey);
    await replay.answer(409);

    TestBed.inject(VoucherChoice).select('v_available');
    const withVoucher = await send();
    expect(withVoucher.body.idempotencyKey).not.toBe(first.body.idempotencyKey);
    await withVoucher.answer(201);
  });

  it('un refus du bon remet le choix à « aucun » et relit la fidélité', async () => {
    ready();
    TestBed.inject(VoucherChoice).select('v_available');
    const attempt = await send();

    expect(await attempt.answer(409)).toBeNull();

    expect(TestBed.inject(VoucherChoice).selected()).toBeNull();
    expect(loyalty.reads.count).toBe(1);
    expect(TestBed.inject(ClientCart).isEmpty()).toBe(false);
  });

  it('relit la fidélité après une passation avec bon — le bon y passe « utilisé »', async () => {
    ready();
    TestBed.inject(VoucherChoice).select('v_available');
    const attempt = await send();

    expect(await attempt.answer(201)).not.toBeNull();

    expect(loyalty.reads.count).toBe(1);
    expect(TestBed.inject(VoucherChoice).selected()).toBeNull();
  });

  it('ne relit rien après une passation sans bon', async () => {
    ready();
    await (await send()).answer(201);

    expect(loyalty.reads.count).toBe(0);
  });
});
