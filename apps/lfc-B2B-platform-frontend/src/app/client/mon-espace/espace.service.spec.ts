import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { hydrateWith, TEST_CATALOGUE } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientCart } from '../cart/client-cart.service';
import { OrderContextStore, type ServiceChoice } from '../order-context.store';
import { ClientOrders } from '../client-orders.service';
import { ClientEspace } from './espace.service';

const AT_THE_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  discount: 10,
  fee: 0,
  slot: '7 h – 8 h',
};

describe('Ce qui attend une action', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  });

  it('ne retient QUE des actions — la facture due en est une, à froid', () => {
    const espace = TestBed.inject(ClientEspace);
    expect(espace.cards().map((c) => c.id)).toEqual(['invoice']);
    expect(espace.count()).toBe(1);
  });

  it('ajoute le panier dès qu’il porte quelque chose, et pas avant', () => {
    const espace = TestBed.inject(ClientEspace);
    expect(espace.cards().some((c) => c.id === 'cart')).toBe(false);

    TestBed.inject(ClientCart).add('VIE-001');
    expect(espace.cards().map((c) => c.id)).toEqual(['cart', 'invoice']);
  });

  it('met la commande prête EN TÊTE, et c’est elle qui porte la crème', () => {
    TestBed.inject(OrderContextStore).choice.set(AT_THE_LABO);
    TestBed.inject(ClientCart).add('VIE-001');
    TestBed.inject(ClientOrders).place();

    const cards = TestBed.inject(ClientEspace).cards();
    expect(cards[0]?.id).toBe('pickup');
    expect(cards[0]?.primary).toBe(true);
    // Le panier a été vidé par la commande : il ne reste que retrait + facture.
    expect(cards.map((c) => c.id)).toEqual(['pickup', 'invoice']);
  });

  it('compte les cartes et le badge d’un SEUL calcul', () => {
    const espace = TestBed.inject(ClientEspace);
    TestBed.inject(ClientCart).add('VIE-001');
    expect(espace.count()).toBe(espace.cards().length);
  });

  it('écrit le titre en toutes lettres, comme la réf — pas en chiffre', () => {
    const espace = TestBed.inject(ClientEspace);
    expect(espace.todayLine()).toBe('Une chose aujourd’hui.');

    TestBed.inject(ClientCart).add('VIE-001');
    expect(espace.todayLine()).toBe('Deux choses aujourd’hui.');
  });

  it('nomme le lieu par sa forme PRÉPOSITIONNELLE — « au Labo », jamais « Le Labo »', () => {
    TestBed.inject(OrderContextStore).choice.set(AT_THE_LABO);
    TestBed.inject(ClientCart).add('VIE-001');
    TestBed.inject(ClientOrders).place();

    const pickup = TestBed.inject(ClientEspace)
      .cards()
      .find((c) => c.id === 'pickup');
    expect(pickup?.lines[1]).toContain('au Labo');
  });
});
