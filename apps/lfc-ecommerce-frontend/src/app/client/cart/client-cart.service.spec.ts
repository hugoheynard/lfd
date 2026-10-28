import { TestBed } from '@angular/core/testing';
import type { ShopItemView } from '@lfd/contracts';

import { ClientCart } from './client-cart.service';
import { OrderContextStore, type ServiceChoice } from '../order-context.store';
import { ClientOrders } from '../client-orders.service';
import { placeOrder, provideRecognised } from '../client-orders.fixture';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { provideWorkspace, workspaceDouble } from '../client-workspace.fixture';

/** Le rang d'une référence dans le rayon — l'ordre que le panier doit suivre. */
const order = (sku: string): number => TEST_ITEMS.findIndex((item) => item.sku === sku);

const AT_THE_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  window: { start: '07:00', end: '08:00' },
  date: '2026-09-07',
};

/** Une instance NEUVE, comme après un rechargement de page. */
function reload(): { cart: ClientCart; order: OrderContextStore; orders: ClientOrders } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      // L'espace connu : sans lui, la vitrine et le devis d'un client reconnu attendent `/me`.
      provideWorkspace(workspaceDouble()),
      provideRecognised(),
    ],
  });
  hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  return {
    cart: TestBed.inject(ClientCart),
    order: TestBed.inject(OrderContextStore),
    orders: TestBed.inject(ClientOrders),
  };
}

/**
 * 🔴 **Régression : un rechargement sur le panier le montrait vide.**
 *
 * Les lignes se projettent à travers le catalogue, et seul l'écran du rayon
 * l'hydratait. Arriver au panier par un lien — ou simplement y recharger la
 * page — donnait donc un panier vide et un total à zéro, alors que le vrai
 * panier était intact dans le navigateur.
 */
describe('Le panier au premier écran venu', () => {
  it('demande le catalogue lui-même, sans attendre le rayon', () => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(workspaceDouble()),
      ],
    });
    const catalogue = TestBed.inject(ShopCatalogue);
    expect(catalogue.status()).toBe('idle');

    TestBed.inject(ClientCart);
    TestBed.tick();

    // Publique ou reconnue : ce cas éprouve que le PANIER hydrate le catalogue
    // lui-même, sans attendre le rayon — pas laquelle des deux routes il prend.
    // Le bypass d'authentification de développement rend le client reconnu en
    // test ; y coder une route figerait cet artefact.
    const asked = TestBed.inject(HttpTestingController).expectOne(
      (request) =>
        request.url.endsWith('/shop/catalogue') || request.url.endsWith('/shop/catalogue/mine'),
    );
    expect(asked.request.method).toBe('GET');
    expect(catalogue.status()).toBe('loading');
  });
});

describe('Les règles du panier', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // L'espace connu : sans lui, la vitrine et le devis d'un client reconnu attendent `/me`.
        provideWorkspace(workspaceDouble()),
        provideRecognised(),
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  });

  /**
   * Le mode de service survit lui aussi au rechargement : sans lui, la boutique
   * renverrait à la question à chaque F5. Il vit dans `OrderContextStore`, mais c'est
   * le panier qui en dépend pour son décompte — d'où sa place ici.
   */
  it('le mode de service survit au rechargement', () => {
    TestBed.inject(OrderContextStore).choice.set(AT_THE_LABO);
    TestBed.flushEffects();

    expect(reload().order.choice()?.place).toBe('Le Labo');
  });

  /**
   * Une référence inconnue est ignorée **en silence** : la laisser entrer
   * mettrait dans l'état une ligne qu'aucun écran ne saurait afficher, et le
   * dépôt la relirait ensuite comme un panier corrompu.
   */
  it('n’ajoute pas une référence que le catalogue ne connaît pas', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('INCONNU');

    expect(cart.isEmpty()).toBe(true);
  });

  /** Le panier se relit comme la boutique se parcourt, pas comme on l'a rempli. */
  it('rend les lignes dans l’ordre du RAYON, pas dans celui des ajouts', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('SAL-001');
    cart.add('VIE-001');

    const shown = cart.lines().map((line) => line.product.sku);
    expect(shown).toEqual([...shown].sort((a, b) => order(a) - order(b)));
  });

  it('compte les PIÈCES, pas les références', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('VIE-001');
    cart.add('VIE-001');
    cart.add('SAL-001');

    expect(cart.count()).toBe(3);
    expect(cart.lines()).toHaveLength(2);
  });

  it('retirer la dernière pièce retire la LIGNE : une ligne à zéro n’existe pas', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('PAT-001');
    cart.remove('PAT-001');

    expect(cart.lines()).toEqual([]);
  });

  it('régler fige la commande et vide le panier : ce qui est payé n’est plus en cours', async () => {
    const cart = TestBed.inject(ClientCart);
    TestBed.inject(OrderContextStore).choice.set(AT_THE_LABO);
    cart.add('VIE-001');
    cart.add('SAL-001');

    const placed = await placeOrder();

    expect(placed?.pieces).toBe(2);
    expect(placed?.lines.map((l) => l.name)).toEqual(['Croissant au beurre', 'Quiche du jour']);
    // Le prix est FIGÉ dans la commande, en centimes HORS TAXE, pas relu du
    // catalogue plus tard. Il était figé en TTC : la commande portait donc une
    // unité que ni la caisse ni la facture n'emploient.
    expect(placed?.lines[0]?.unitPriceCents).toBe(140);
    expect(cart.isEmpty()).toBe(true);
  });

  /**
   * 🔴 La corbeille du panier retire la LIGNE, quelle que soit sa quantité.
   * `remove` décompte ; sur douze croissants, il faudrait douze appuis.
   */
  it('retirer la ligne ne demande pas de la décompter', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('VIE-001');
    cart.add('VIE-001');
    cart.add('VIE-001');
    cart.add('SAL-001');

    cart.drop('VIE-001');

    expect(cart.quantityOf('VIE-001')).toBe(0);
    expect(cart.quantityOf('SAL-001')).toBe(1);
  });

  it('retirer une ligne absente ne fait rien, et ne la crée pas', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('VIE-001');

    cart.drop('SAL-001');

    expect(cart.count()).toBe(1);
  });

  /**
   * Aucun de ces deux cas ne doit ATTEINDRE le serveur : refuser au plus tôt
   * évite une commande vide à laquelle il faudrait répondre 400. Le harnais
   * HTTP le vérifie — une requête partie ferait échouer `verify()`.
   */
  it('ne fige rien sans mode de service ni sans panier', async () => {
    const orders = TestBed.inject(ClientOrders);
    expect(await orders.place()).toBeNull();

    TestBed.inject(OrderContextStore).choice.set(AT_THE_LABO);
    expect(await orders.place()).toBeNull();

    TestBed.inject(HttpTestingController).verify();
  });
});

/** P4 de `vente-au-poids.md` : un article au poids se compte en grammes, au pas. */
describe('Le panier, au poids', () => {
  const SALMON = {
    ...(TEST_ITEMS[0] as ShopItemView),
    sku: 'SAU-001',
    name: 'Saumon gravlax',
    unitPriceMillicents: 1_175_000,
    unitPriceTtcCents: 1_240,
    saleUnit: 'weight' as const,
    weightStepGrams: 50,
    weightMinGrams: 200,
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideWorkspace(workspaceDouble()),
        provideRecognised(),
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), {
      ...TEST_CATALOGUE,
      items: [...TEST_CATALOGUE.items, SALMON],
    });
  });

  it('ajoute le minimum, puis un pas ; et retire la ligne sous le minimum', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('SAU-001');
    expect(cart.quantityOf('SAU-001')).toBe(200);
    cart.add('SAU-001');
    expect(cart.quantityOf('SAU-001')).toBe(250);

    cart.remove('SAU-001');
    cart.remove('SAU-001');
    expect(cart.lines()).toEqual([]);
  });

  it('compte une ligne au poids pour UNE, jamais pour ses grammes', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('SAU-001');
    cart.add('VIE-001');
    cart.add('VIE-001');

    expect(cart.count()).toBe(3);
  });

  it('envoie la ligne avec son unité à la passation, et la commande la garde', async () => {
    const cart = TestBed.inject(ClientCart);
    TestBed.inject(OrderContextStore).choice.set(AT_THE_LABO);
    cart.setQuantity('SAU-001', 500);

    const placing = TestBed.inject(ClientOrders).place();
    await Promise.resolve();
    await Promise.resolve();
    const request = TestBed.inject(HttpTestingController).expectOne((r) =>
      r.url.endsWith('/orders'),
    );
    expect((request.request.body as { lines: unknown }).lines).toEqual([
      { sku: 'SAU-001', quantity: 500, saleUnit: 'weight' },
    ]);
    request.flush({ id: 'ord_1', orderNumber: 'CMD-0001' });

    const placed = await placing;
    expect(placed?.lines[0]).toMatchObject({ quantity: 500, saleUnit: 'weight' });
    expect(placed?.pieces).toBe(1);
  });
});
