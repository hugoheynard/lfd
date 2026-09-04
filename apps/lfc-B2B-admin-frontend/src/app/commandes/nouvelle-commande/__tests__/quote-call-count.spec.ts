import { effect, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CartStore } from '../cart.store';

/**
 * **Combien d'appels au devis une saisie déclenche** — la mesure, pas l'estimation.
 *
 * `nouvelle-commande-page.ts` porte un `effect()` sur `cart.lines()` qui appelle
 * `refreshQuote` **sans debounce et sans déduplication** : sa seule garde est le
 * panier vide. Une émission du signal vaut donc un appel HTTP, et un appel vaut
 * `3 × lignes + 2` opérations facturées côté serveur — trois lectures par
 * article dans `resolveOne`, plus le catalogue et les engagements, eux
 * mutualisés.
 *
 * Ce test ne juge pas ce nombre : il le **rend visible**. Le jour où quelqu'un
 * pose un debounce ou une hydratation, il rougit — et c'est exactement le moment
 * où l'on veut relire le calcul.
 *
 * Mesuré le 2026-09-04 sur la session ci-dessous : **13 appels, ~251
 * opérations**, là où un seul devis au moment de valider en coûterait 26. Cf.
 * `documentation/b2b/optimisation-resolution-de-prix.md` §3.
 */
const product = (n: number) => ({
  sku: `VIE-${String(n).padStart(3, '0')}`,
  name: `Produit ${String(n)}`,
  unitPriceMillicents: 200_000,
});

describe('le nombre de devis qu’une saisie déclenche', () => {
  it('émet une fois par mutation du panier — donc un appel par geste', () => {
    TestBed.configureTestingModule({});
    const cart = new CartStore();
    const injector = TestBed.inject(Injector);
    let emissions = 0;

    runInInjectionContext(injector, () => {
      effect(() => {
        cart.lines();
        emissions += 1;
      });
    });
    TestBed.flushEffects();

    // Une saisie ordinaire, telle qu'un commercial la fait au téléphone : huit
    // références ajoutées, quatre quantités reprises, une ligne retirée.
    for (let index = 1; index <= 8; index += 1) {
      cart.add(product(index), 12);
      TestBed.flushEffects();
    }
    for (let index = 1; index <= 4; index += 1) {
      cart.setQuantity(product(index).sku, 24);
      TestBed.flushEffects();
    }
    cart.remove(product(8).sku);
    TestBed.flushEffects();

    // 1 émission initiale (panier vide — l'écran n'appelle pas) + 13 mutations.
    expect(emissions).toBe(14);
  });

  /**
   * La déduplication n'existe pas : reposer la MÊME quantité ré-émet.
   *
   * C'est le cas le plus coûteux pour rien, et le plus facile à produire — un
   * champ de quantité qui perd puis reprend le focus, une flèche haut puis bas.
   */
  it('ré-émet même quand la quantité ne change pas de valeur', () => {
    TestBed.configureTestingModule({});
    const cart = new CartStore();
    const injector = TestBed.inject(Injector);
    let emissions = 0;

    runInInjectionContext(injector, () => {
      effect(() => {
        cart.lines();
        emissions += 1;
      });
    });
    cart.add(product(1), 12);
    TestBed.flushEffects();
    const before = emissions;

    cart.setQuantity(product(1).sku, 12);
    TestBed.flushEffects();

    expect(emissions).toBe(before + 1);
  });
});
