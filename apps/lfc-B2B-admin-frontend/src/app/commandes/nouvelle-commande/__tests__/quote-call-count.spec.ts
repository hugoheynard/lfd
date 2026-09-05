import { describe, expect, it } from 'vitest';

import type { CartLine } from '../cart.store';
import { CartStore } from '../cart.store';
import { quoteKeyOf } from '../quote-key';

/**
 * **Combien de devis une saisie déclenche** — la mesure, tenue dans le temps.
 *
 * Avant les garde-fous, l'écran appelait à **chaque émission** de `cart.lines()`,
 * qui rend un tableau neuf à chaque geste : 13 appels pour la session ci-dessous,
 * ~251 opérations facturées côté serveur.
 *
 * Ce que ce fichier mesure aujourd'hui, c'est le nombre d'**états distincts** du
 * panier — donc le nombre d'appels que `distinctUntilChanged` laisse passer.
 *
 * ⚠️ **Ce n'est pas le nombre final.** Le `debounceTime` de l'écran en retire
 * encore, mais seulement ce qui arrive en rafale — deux chiffres tapés d'affilée
 * dans un champ de quantité. Il ne retire rien à huit clics espacés de deux
 * secondes, et c'est voulu : chacun est une intention, et le commercial lit le
 * prix au téléphone entre deux. Ce que la déduplication retire, ce sont les
 * gestes qui ne demandent rien de nouveau.
 */
const product = (n: number): Omit<CartLine, 'quantity'> => ({
  sku: `VIE-${String(n).padStart(3, '0')}`,
  name: `Produit ${String(n)}`,
  unitPriceMillicents: 200_000,
});

const COMPANY = 'c_1';

/** Les états distincts qu'une suite de gestes produit — donc les appels laissés passer. */
function distinctStates(gestures: readonly ((cart: CartStore) => void)[]): number {
  const cart = new CartStore();
  const seen: string[] = [];
  for (const gesture of gestures) {
    gesture(cart);
    const key = quoteKeyOf(COMPANY, cart.lines());
    if (key !== '' && key !== seen.at(-1)) {
      seen.push(key);
    }
  }
  return seen.length;
}

describe('le nombre de devis qu’une saisie déclenche', () => {
  it('compte un appel par état RÉELLEMENT nouveau du panier', () => {
    // La saisie d'un commercial au téléphone : huit références ajoutées, quatre
    // quantités reprises, une ligne retirée. Treize gestes, treize états
    // différents — la déduplication ne retire rien ici, et c'est juste : chacun
    // change ce que le serveur facturerait.
    const gestures = [
      ...Array.from({ length: 8 }, (_, index) => (cart: CartStore) => {
        cart.add(product(index + 1), 12);
      }),
      ...Array.from({ length: 4 }, (_, index) => (cart: CartStore) => {
        cart.setQuantity(product(index + 1).sku, 24);
      }),
      (cart: CartStore) => {
        cart.remove(product(8).sku);
      },
    ];

    expect(distinctStates(gestures)).toBe(13);
  });

  /**
   * 🔴 Ce que la déduplication retire, et que le signal ne voyait pas.
   *
   * `cart.lines()` ré-émet même quand la quantité **ne change pas de valeur** —
   * un champ qui perd puis reprend le focus, une flèche haut puis bas. Avant
   * `quoteKeyOf`, chacun de ces gestes coûtait un aller-retour et une facture.
   */
  it('ne compte rien quand un geste ne change pas le panier', () => {
    const gestures = [
      (cart: CartStore) => {
        cart.add(product(1), 12);
      },
      // Reposer la même quantité, trois fois.
      (cart: CartStore) => {
        cart.setQuantity(product(1).sku, 12);
      },
      (cart: CartStore) => {
        cart.setQuantity(product(1).sku, 12);
      },
      (cart: CartStore) => {
        cart.setQuantity(product(1).sku, 12);
      },
    ];

    expect(distinctStates(gestures)).toBe(1);
  });

  it('ne compte rien pour un retrait suivi d’un ajout identique', () => {
    // Le panier revient à l'état qu'il avait : il n'y a rien à redemander, et
    // l'ordre des lignes n'entre pas dans la clé.
    const gestures = [
      (cart: CartStore) => {
        cart.add(product(1), 12);
      },
      (cart: CartStore) => {
        cart.add(product(2), 6);
      },
      (cart: CartStore) => {
        cart.remove(product(2).sku);
      },
      (cart: CartStore) => {
        cart.add(product(2), 6);
      },
    ];

    // Trois états distincts : {1}, {1,2}, {1} — puis le retour à {1,2}, qui
    // diffère du précédent. Le quatrième geste compte donc, et le troisième
    // aussi : seul un geste qui ne change RIEN est gratuit.
    expect(distinctStates(gestures)).toBe(4);
  });
});
