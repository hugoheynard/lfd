import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ShopQuoteView } from '@lfd/contracts';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthFacade } from '../../auth/auth.facade';
import { CartStore } from './cart.store';
import { ShopQuote } from './shop-quote.service';
import { hydrateWith, TEST_CATALOGUE, TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../shop/shop-catalogue.store';

const SKU = TEST_ITEMS[0]?.sku ?? '';

const ANSWER: ShopQuoteView = {
  lines: [],
  subtotalHtCents: 1_200,
  discountCents: 0,
  discountAdjustment: null,
  deliveryFeeCents: 0,
  vat: [{ rate: 5.5, amountCents: 66 }],
  totalCents: 1_266,
};

function boot(): { quote: ShopQuote; cart: CartStore; http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
  return {
    quote: TestBed.inject(ShopQuote),
    cart: TestBed.inject(CartStore),
    http: TestBed.inject(HttpTestingController),
  };
}

/**
 * La route du devis, **publique ou reconnue**.
 *
 * Les deux, parce que ces cas éprouvent l'anti-rebond et la reprise après
 * échec — pas le choix de la route. Y coder `/mine` reviendrait à figer ici un
 * artefact du bypass d'authentification de développement, qui rend le client
 * reconnu en test. La bascule elle-même est éprouvée plus bas, en fournissant
 * les deux états.
 */
const QUOTE = (request: { url: string }): boolean =>
  request.url.endsWith('/shop/quote') || request.url.endsWith('/shop/quote/mine');

/** Le devis part au bout de l'accalmie ; avant, rien n'a bougé sur le réseau. */
const QUIET_MS = 400;

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

describe('ShopQuote', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * 🔴 **Régression : une salve de gestes faisait une salve d'appels.**
   *
   * Six clics sur « + » partaient en six requêtes, chacune coûtant au serveur
   * quatre lectures plus une résolution de prix par ligne — sur une route
   * publique. Un facteur côté écran ne se rattrape pas en divisant une constante
   * côté serveur.
   */
  it('une SALVE de gestes ne fait qu’un seul appel', () => {
    const { cart, http } = boot();

    for (let click = 1; click <= 6; click += 1) {
      cart.setQuantity(SKU, click);
      quiet(50);
    }
    quiet();

    const asked = http.match(QUOTE);
    expect(asked).toHaveLength(1);
    // C'est l'état d'ARRIVÉE qui est chiffré, jamais celui qui a lancé la salve.
    expect((asked[0]?.request.body as { lines: { quantity: number }[] }).lines[0]?.quantity).toBe(
      6,
    );
    asked[0]?.flush(ANSWER);
    http.verify();
  });

  it('ne redemande rien quand le panier ne change pas vraiment', () => {
    const { cart, http } = boot();

    cart.setQuantity(SKU, 2);
    quiet();
    http.expectOne(QUOTE).flush(ANSWER);

    // Reposer la même quantité ne change aucun prix : la clé est identique.
    cart.setQuantity(SKU, 2);
    quiet();

    expect(http.match(QUOTE)).toHaveLength(0);
    http.verify();
  });

  /**
   * Le dernier décompte connu reste à l'écran pendant l'attente — le vider
   * ferait clignoter le total sous les doigts. C'est `status` qui dit qu'on en
   * attend un neuf, et l'écran atténue au lieu de vider.
   */
  it('garde le dernier décompte pendant qu’il en demande un autre', () => {
    const { cart, quote, http } = boot();

    cart.setQuantity(SKU, 1);
    quiet();
    http.expectOne(QUOTE).flush(ANSWER);
    expect(quote.status()).toBe('ready');

    cart.setQuantity(SKU, 2);
    quiet(10);

    expect(quote.status()).toBe('loading');
    expect(quote.totals().totalCents).toBe(1_266);

    quiet();
    http.expectOne(QUOTE).flush({ ...ANSWER, totalCents: 2_532 });
    expect(quote.totals().totalCents).toBe(2_532);
    http.verify();
  });

  it('un panier vidé ne demande rien, et retombe à zéro', () => {
    const { cart, quote, http } = boot();

    cart.setQuantity(SKU, 1);
    quiet();
    http.expectOne(QUOTE).flush(ANSWER);

    cart.setQuantity(SKU, 0);
    quiet();

    expect(http.match(QUOTE)).toHaveLength(0);
    expect(quote.status()).toBe('idle');
    expect(quote.totals().totalCents).toBe(0);
    http.verify();
  });

  /**
   * Un échec ne rompt pas le flux : le devis suivant doit partir. Sans
   * `catchError`, une seule erreur réseau éteindrait le décompte pour le reste
   * de la session.
   */
  it('survit à un échec, et redemande au geste suivant', () => {
    const { cart, quote, http } = boot();

    cart.setQuantity(SKU, 1);
    quiet();
    http.expectOne(QUOTE).error(new ProgressEvent('boom'));
    expect(quote.status()).toBe('failed');

    cart.setQuantity(SKU, 3);
    quiet();
    http.expectOne(QUOTE).flush(ANSWER);

    expect(quote.status()).toBe('ready');
    http.verify();
  });
});

/**
 * **Le devis part à la route qui correspond au lecteur.**
 *
 * 🔴 Tant que le panier chiffrait au tarif public, un compte sous mercuriale
 * voyait un total qui n'était pas le sien. L'écart était en sa faveur et
 * silencieux — donc personne ne réclamait, et rien de ce qu'on lui avait
 * négocié ne lui était montré avant la confirmation.
 */
describe('la route du devis', () => {
  // `quiet()` avance des horloges simulées : sans ce couple, la salve
  // d'anti-rebond n'arrive jamais et l'appel ne part pas.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function bootAs(recognised: boolean): { cart: CartStore; http: HttpTestingController } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthFacade,
          useValue: { isAuthenticated: () => recognised, accessToken$: () => of('jeton-de-test') },
        },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), TEST_CATALOGUE);
    TestBed.inject(ShopQuote);
    return { cart: TestBed.inject(CartStore), http: TestBed.inject(HttpTestingController) };
  }

  it('demande la route PUBLIQUE à un visiteur', () => {
    const { cart, http } = bootAs(false);
    cart.setQuantity(SKU, 1);
    quiet();

    const asked = http.expectOne(QUOTE);
    expect(asked.request.url).toMatch(/\/shop\/quote$/u);
    // Sans jeton : la vitrine se visite sans compte, c'est le parcours par défaut.
    expect(asked.request.headers.has('Authorization')).toBe(false);
    asked.flush(ANSWER);
  });

  it('demande la route RECONNUE, jeton en tête, à un client identifié', () => {
    const { cart, http } = bootAs(true);
    cart.setQuantity(SKU, 1);
    quiet();

    const asked = http.expectOne(QUOTE);
    expect(asked.request.url).toMatch(/\/shop\/quote\/mine$/u);
    expect(asked.request.headers.get('Authorization')).toBe('Bearer jeton-de-test');
    asked.flush(ANSWER);
  });

  it('ne nomme AUCUNE société : le serveur la résout depuis les rattachements', () => {
    // Le corps ne porte que le panier et l'acheminement. Un identifiant de
    // société envoyé d'ici devrait être vérifié à l'arrivée ; n'en envoyer aucun
    // rend le sondage d'un tarif concurrent inexprimable.
    const { cart, http } = bootAs(true);
    cart.setQuantity(SKU, 1);
    quiet();

    const asked = http.expectOne(QUOTE);
    expect(JSON.stringify(asked.request.body)).not.toContain('companyId');
    asked.flush(ANSWER);
  });
});
