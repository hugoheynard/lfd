import { TestBed } from '@angular/core/testing';

import { ClientCart } from './client-cart.service';
import { ClientOrder, type ServiceChoice } from './client-order.service';
import { ClientOrders } from './client-orders.service';

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

describe('Le panier et le mode de service, relus du navigateur', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('survit à un rechargement — le panier n’est pas perdu par un F5', () => {
    const cart = TestBed.inject(ClientCart);
    cart.add('croissant');
    cart.add('croissant');
    cart.add('ski');
    TestBed.flushEffects();

    expect(reload().cart.quantityOf('croissant')).toBe(2);
  });

  it('le mode de service aussi : la boutique ne renvoie plus à la question', () => {
    TestBed.inject(ClientOrder).choice.set(AT_THE_LABO);
    TestBed.flushEffects();

    expect(reload().order.choice()?.place).toBe('Le Labo');
  });

  it('oublie une référence qui n’est plus au catalogue plutôt que de tomber', () => {
    localStorage.setItem('lfc.cart', JSON.stringify({ croissant: 2, fantome: 3 }));

    const { cart } = reload();
    expect(cart.quantityOf('croissant')).toBe(2);
    expect(cart.count()).toBe(2);
  });

  it('un contenu illisible est traité comme absent, pas comme une erreur', () => {
    localStorage.setItem('lfc.cart', 'ceci n’est pas du JSON');

    expect(reload().cart.isEmpty()).toBe(true);
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
