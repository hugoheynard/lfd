import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { hydrateWith, TEST_CATALOGUE } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';
import { ClientCart } from '../cart/client-cart.service';
import { provideRecognised } from '../client-orders.fixture';
import { ClientOrderHistory } from '../mes-commandes/client-order-history.service';
import { LIVE_PICKUP } from '../mes-commandes/order-view.fixture';
import { ClientEspace } from './espace.service';

/**
 * 🔴 **Ces cas posaient une commande dans le `localStorage`.**
 *
 * L'accueil la lisait de là, pendant que « Mes commandes » lisait le serveur :
 * deux vérités sur le même client. La suite pose maintenant la liste du SERVEUR
 * — exactement ce que le shell fait au démarrage — parce que c'est elle que
 * l'écran lit.
 */
function serveur(): ClientOrderHistory {
  const history = TestBed.inject(ClientOrderHistory);
  history.receive([LIVE_PICKUP]);
  return history;
}

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

  it('met la commande prête EN TÊTE, et c’est elle qui porte la crème', () => {
    serveur();

    const cards = TestBed.inject(ClientEspace).cards();
    expect(cards[0]?.id).toBe('pickup');
    expect(cards[0]?.primary).toBe(true);
    // Rien dans le panier : il ne reste que le retrait.
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

  /** Le lieu et la tranche viennent des dérivations partagées avec le suivi. */
  it('nomme le LIEU figé par la commande, et sa tranche', () => {
    serveur();

    const pickup = TestBed.inject(ClientEspace)
      .cards()
      .find((c) => c.id === 'pickup');
    expect(pickup?.lines[0]).toContain('CMD-0009');
    expect(pickup?.lines[1]).toContain('Le Labo');
    expect(pickup?.lines[1]).toContain('7:00 – 8:00');
  });

  /**
   * La carte mène au QR, qui a son écran depuis le lot 4 — plus au
   * récapitulatif de confirmation qui servait de pis-aller.
   */
  it('mène au QR de CETTE commande', () => {
    serveur();

    const pickup = TestBed.inject(ClientEspace)
      .cards()
      .find((c) => c.id === 'pickup');
    expect(pickup?.route).toBe('/mes-commandes/retrait/ord_9');
  });
});
