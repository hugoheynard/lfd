import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ShopCartPayload, ShopCartResponse, ShopCartView } from '@lfd/contracts';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { CartStore } from './cart.store';
import { ShopCartSync } from './shop-cart-sync.service';

/** La route, quelle que soit la racine d'API configurée. */
const CART = (request: { url: string }): boolean => request.url.endsWith('/shop/cart');

/** L'accalmie avant écriture ; avant, rien n'a bougé sur le réseau. */
const QUIET_MS = 400;

const HIER = '2026-09-05T08:00:00.000Z';
const AUJOURD_HUI = '2026-09-06T08:00:00.000Z';

/**
 * Façade doublée : la SEULE frontière que ce test n'a pas à éprouver. Auth0
 * exige un tenant distant, et ce qui compte ici est ce qui se passe **une fois**
 * que quelqu'un est reconnu.
 */
const recognised = {
  isAuthenticated: signal(true),
  accessToken$: () => of('jeton-de-test'),
};

/**
 * L'app est **zoneless** : `fakeAsync` n'y existe pas, faute de `zone.js`. On
 * avance donc les horloges de vitest, et on pousse les effets à la main —
 * `toObservable` émet depuis un effet, qui ne s'exécute pas tout seul en test.
 */
function quiet(ms = QUIET_MS): void {
  TestBed.tick();
  vi.advanceTimersByTime(ms);
  TestBed.tick();
}

function boot(): { cart: CartStore; http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AuthFacade, useValue: recognised },
    ],
  });
  const cart = TestBed.inject(CartStore);
  return { cart, http: TestBed.inject(HttpTestingController) };
}

/** Réveille la synchronisation et répond à sa lecture par ce que le serveur porte. */
function serverHolds(http: HttpTestingController, cart: ShopCartView | null): void {
  TestBed.inject(ShopCartSync);
  TestBed.tick();
  http.expectOne(CART).flush({ cart } satisfies ShopCartResponse);
  TestBed.tick();
}

function saved(lines: ShopCartView['lines'], savedAt: string): ShopCartView {
  return { lines, savedAt };
}

describe('ShopCartSync', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Le sens qui justifie le chantier : le panier du matin retrouvé l'après-midi. */
  it('reprend le panier du serveur quand il est plus récent que celui du navigateur', () => {
    const { cart, http } = boot();
    cart.setQuantity('VIE-001', 1, HIER);

    serverHolds(http, saved([{ sku: 'PAT-001', quantity: 4 }], AUJOURD_HUI));

    expect(cart.quantities()).toEqual({ 'PAT-001': 4 });
    // Rien n'est réécrit : on vient de le lire.
    quiet();
    http.expectNone(CART);
  });

  /**
   * 🔴 **Le cas qui a décidé de la forme du contrat.**
   *
   * Un panier vidé ailleurs se relit comme un panier à ZÉRO LIGNE, pas comme une
   * absence. Une fusion ligne à ligne — l'union, la quantité locale gagnant —
   * aurait ici ressuscité le panier de la veille : une union ne sait pas
   * représenter un retrait.
   */
  it('un panier vidé sur un autre appareil vide celui-ci', () => {
    const { cart, http } = boot();
    cart.setQuantity('VIE-001', 3, HIER);

    serverHolds(http, saved([], AUJOURD_HUI));

    expect(cart.quantities()).toEqual({});
  });

  it('pousse la copie du navigateur quand c’est elle la plus récente', () => {
    const { cart, http } = boot();
    cart.setQuantity('VIE-001', 2, AUJOURD_HUI);

    serverHolds(http, saved([{ sku: 'PAT-001', quantity: 9 }], HIER));

    const written = http.expectOne(CART);
    expect(written.request.method).toBe('PUT');
    expect((written.request.body as ShopCartPayload).lines).toEqual([
      { sku: 'VIE-001', quantity: 2 },
    ]);
    expect(cart.quantities()).toEqual({ 'VIE-001': 2 });
  });

  /**
   * Un panier local SANS date est un panier d'avant ce chantier : il cède devant
   * une copie serveur, mais il remonte quand il n'y en a aucune.
   */
  it('un panier local sans date cède devant une copie du serveur', () => {
    // Un panier écrit AVANT ce chantier : des quantités, et aucune date.
    localStorage.setItem('lfc.cart', JSON.stringify({ 'VIE-001': 1 }));
    const { cart, http } = boot();
    expect(cart.quantities()).toEqual({ 'VIE-001': 1 });
    expect(cart.savedAt()).toBeNull();

    serverHolds(http, saved([{ sku: 'PAT-001', quantity: 2 }], HIER));

    expect(cart.quantities()).toEqual({ 'PAT-001': 2 });
  });

  /**
   * Ouvrir la boutique et se connecter ne compose pas un panier. Écrire une
   * ligne vide pour chaque visite remplirait la table de paniers que personne
   * n'a jamais commencés — et rendrait la relance d'abandon illisible.
   */
  it('n’écrit rien quand personne n’a jamais rien composé', () => {
    const { http } = boot();

    serverHolds(http, null);

    quiet();
    http.expectNone(CART);
  });

  /**
   * 🔴 Une salve de gestes ne fait qu'une écriture, et c'est l'état d'ARRIVÉE
   * qui part — la même règle que le devis, sur la même salve.
   */
  it('une salve de gestes ne fait qu’un seul enregistrement', () => {
    const { cart, http } = boot();
    serverHolds(http, null);

    cart.setQuantity('VIE-001', 1);
    cart.setQuantity('VIE-001', 2);
    cart.setQuantity('VIE-001', 3);
    quiet();

    const written = http.expectOne(CART);
    expect((written.request.body as ShopCartPayload).lines).toEqual([
      { sku: 'VIE-001', quantity: 3 },
    ]);
  });

  /**
   * Un échec de lecture n'est pas un panier vide : perdre la synchronisation
   * d'une session vaut mieux que vider un panier parce que le réseau a hoqueté.
   */
  it('un échec de lecture ne touche pas au panier affiché', () => {
    const { cart, http } = boot();
    cart.setQuantity('VIE-001', 2, HIER);

    TestBed.inject(ShopCartSync);
    TestBed.tick();
    http.expectOne(CART).error(new ProgressEvent('coupure'));
    TestBed.tick();

    expect(cart.quantities()).toEqual({ 'VIE-001': 2 });
  });

  /**
   * 🔴 **Régression : un geste fait pendant une lecture lente partait avant
   * elle.**
   *
   * L'écriture s'autorisait dès que la lecture était PARTIE, pas quand elle
   * avait répondu. Trois cents millisecondes plus tard, la copie locale montait
   * donc au serveur — puis la reprise arrivait et posait la copie distante à
   * l'écran. Les deux divergeaient, et rien ne le disait.
   */
  it('n’écrit rien tant que la lecture n’a pas répondu', () => {
    const { cart, http } = boot();
    TestBed.inject(ShopCartSync);
    TestBed.tick();
    const reading = http.expectOne(CART);
    expect(reading.request.method).toBe('GET');

    cart.setQuantity('VIE-001', 1);
    quiet();
    expect(http.match(CART).filter((r) => r.request.method === 'PUT')).toEqual([]);

    // La reprise tranche ensuite, et le geste — plus récent que la copie du
    // serveur — l'emporte : il n'a été ni perdu, ni écrit trop tôt.
    reading.flush({ cart: saved([{ sku: 'PAT-001', quantity: 2 }], HIER) });
    TestBed.tick();

    expect(cart.quantities()).toEqual({ 'VIE-001': 1 });
    expect((http.expectOne(CART).request.body as ShopCartPayload).lines).toEqual([
      { sku: 'VIE-001', quantity: 1 },
    ]);
  });

  /** Un échec d'écriture n'éteint pas la synchronisation pour le reste de la session. */
  it('reprend l’écriture après un échec', () => {
    const { cart, http } = boot();
    serverHolds(http, null);

    cart.setQuantity('VIE-001', 1);
    quiet();
    http.expectOne(CART).error(new ProgressEvent('coupure'));
    TestBed.tick();

    cart.setQuantity('VIE-001', 2);
    quiet();
    expect((http.expectOne(CART).request.body as ShopCartPayload).lines).toEqual([
      { sku: 'VIE-001', quantity: 2 },
    ]);
  });
});
