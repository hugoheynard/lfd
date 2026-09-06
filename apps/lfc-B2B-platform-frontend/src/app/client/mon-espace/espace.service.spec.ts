import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { hydrateWith, TEST_CATALOGUE } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientCart } from '../cart/client-cart.service';
import { OrderContextStore, type ServiceChoice } from '../order-context.store';
import { placeOrder, provideRecognised } from '../client-orders.fixture';
import { ClientEspace } from './espace.service';

const AT_THE_LABO: ServiceChoice = {
  mode: 'pickup',
  place: 'Le Labo',
  at: 'au Labo',
  address: 'Route de la Balme, Val d’Isère',
  pickupAddressId: 'pick_labo',
  slot: '7 h – 8 h',
  date: '2026-09-07',
};

describe('Ce qui attend une action', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRecognised()],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  });

  /**
   * 🔴 Une carte « facture à régler » ouvrait cet écran à froid, avec 248,60 €
   * dus écrits en dur. Aucune facture n'est émise dans ce système : l'accueil
   * réclamait un règlement qui n'existe pas.
   */
  it('n’a RIEN à proposer sur un compte au repos', () => {
    const espace = TestBed.inject(ClientEspace);
    expect(espace.cards()).toEqual([]);
    expect(espace.count()).toBe(0);
  });

  it('ajoute le panier dès qu’il porte quelque chose, et pas avant', () => {
    const espace = TestBed.inject(ClientEspace);
    expect(espace.cards().some((c) => c.id === 'cart')).toBe(false);

    TestBed.inject(ClientCart).add('VIE-001');
    expect(espace.cards().map((c) => c.id)).toEqual(['cart']);
  });

  it('met la commande prête EN TÊTE, et c’est elle qui porte la crème', async () => {
    TestBed.inject(OrderContextStore).choice.set(AT_THE_LABO);
    TestBed.inject(ClientCart).add('VIE-001');
    await placeOrder();

    const cards = TestBed.inject(ClientEspace).cards();
    expect(cards[0]?.id).toBe('pickup');
    expect(cards[0]?.primary).toBe(true);
    // Le panier a été vidé par la commande : il ne reste que le retrait.
    expect(cards.map((c) => c.id)).toEqual(['pickup']);
  });

  it('compte les cartes et le badge d’un SEUL calcul', () => {
    const espace = TestBed.inject(ClientEspace);
    TestBed.inject(ClientCart).add('VIE-001');
    expect(espace.count()).toBe(espace.cards().length);
  });

  it('écrit le titre en toutes lettres, comme la réf — pas en chiffre', () => {
    const espace = TestBed.inject(ClientEspace);
    TestBed.inject(ClientCart).add('VIE-001');
    expect(espace.todayLine()).toBe('Une chose aujourd’hui.');
  });

  it('nomme le lieu par sa forme PRÉPOSITIONNELLE — « au Labo », jamais « Le Labo »', async () => {
    TestBed.inject(OrderContextStore).choice.set(AT_THE_LABO);
    TestBed.inject(ClientCart).add('VIE-001');
    await placeOrder();

    const pickup = TestBed.inject(ClientEspace)
      .cards()
      .find((c) => c.id === 'pickup');
    expect(pickup?.lines[1]).toContain('au Labo');
  });
});
