import { TestBed } from '@angular/core/testing';

import { ClientCart } from './client-cart.service';
import { ClientOrder, type ServiceChoice } from '../client-order.service';
import { ClientOrders } from '../client-orders.service';
import { SHOP_PRODUCTS } from '../shop/mock-shop';

/** Le rang d'une référence dans le rayon — l'ordre que le panier doit suivre. */
const order = (id: string): number => SHOP_PRODUCTS.findIndex((p) => p.id === id);

const AT_THE_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  discount: 10,
  fee: 0,
  slot: '7 h – 8 h',
};

/** Une instance NEUVE, comme après un rechargement de page. */
function reload(): { cart: ClientCart; order: ClientOrder; orders: ClientOrders } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return {
    cart: TestBed.inject(ClientCart),
    order: TestBed.inject(ClientOrder),
    orders: TestBed.inject(ClientOrders),
  };
}

describe('Les règles du panier', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  /**
   * Le mode de service survit lui aussi au rechargement : sans lui, la boutique
   * renverrait à la question à chaque F5. Il vit dans `ClientOrder`, mais c'est
   * le panier qui en dépend pour son décompte — d'où sa place ici.
   */
  it('le mode de service survit au rechargement', () => {
    TestBed.inject(ClientOrder).choice.set(AT_THE_LABO);
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
    cart.add('fantome');

    expect(cart.isEmpty()).toBe(true);
  });

  /** Le panier se relit comme la boutique se parcourt, pas comme on l'a rempli. */
  it('rend les lignes dans l’ordre du RAYON, pas dans celui des ajouts', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('quiche');
    cart.add('croissant');

    const shown = cart.lines().map((line) => line.product.id);
    expect(shown).toEqual([...shown].sort((a, b) => order(a) - order(b)));
  });

  it('compte les PIÈCES, pas les références', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('croissant');
    cart.add('croissant');
    cart.add('quiche');

    expect(cart.count()).toBe(3);
    expect(cart.lines()).toHaveLength(2);
  });

  it('retirer la dernière pièce retire la LIGNE : une ligne à zéro n’existe pas', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('eclair');
    cart.remove('eclair');

    expect(cart.lines()).toEqual([]);
  });

  it('régler fige la commande et vide le panier : ce qui est payé n’est plus en cours', () => {
    const cart = TestBed.inject(ClientCart);
    TestBed.inject(ClientOrder).choice.set(AT_THE_LABO);
    cart.add('croissant');
    cart.add('quiche');

    const placed = TestBed.inject(ClientOrders).place();

    expect(placed?.pieces).toBe(2);
    expect(placed?.lines.map((l) => l.name)).toEqual(['Croissant au beurre', 'Quiche du jour']);
    // Le prix est FIGÉ dans la commande, pas relu du catalogue plus tard.
    expect(placed?.lines[0]?.unitPrice).toBe(1.4);
    expect(cart.isEmpty()).toBe(true);
  });

  it('ne fige rien sans mode de service ni sans panier', () => {
    const orders = TestBed.inject(ClientOrders);
    expect(orders.place()).toBeNull();

    TestBed.inject(ClientOrder).choice.set(AT_THE_LABO);
    expect(orders.place()).toBeNull();
  });
});
