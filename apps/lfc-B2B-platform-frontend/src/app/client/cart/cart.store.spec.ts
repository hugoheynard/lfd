import { TestBed } from '@angular/core/testing';

import { CartStore } from './cart.store';

/** Une instance NEUVE, comme après un rechargement de page. */
function reload(): CartStore {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(CartStore);
}

describe('Le panier relu du navigateur', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('survit à un rechargement — le panier n’est pas perdu par un F5', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('croissant', 2);
    store.setQuantity('ski', 1);
    TestBed.flushEffects();

    expect(reload().quantityOf('croissant')).toBe(2);
  });

  /**
   * La seule règle que le dépôt porte, et elle parle du STOCKAGE : une référence
   * que le catalogue ne connaît plus ne rentre pas. Sans elle, un produit retiré
   * du rayon ferait tomber l'écran qui tente de l'afficher.
   */
  it('oublie une référence qui n’est plus au catalogue plutôt que de tomber', () => {
    localStorage.setItem('lfc.cart', JSON.stringify({ croissant: 2, fantome: 3 }));

    const store = reload();
    expect(store.quantityOf('croissant')).toBe(2);
    expect(store.quantityOf('fantome')).toBe(0);
  });

  it('un contenu illisible est traité comme absent, pas comme une erreur', () => {
    localStorage.setItem('lfc.cart', 'ceci n’est pas du JSON');

    expect(reload().quantities()).toEqual({});
  });

  /**
   * Zéro **retire la clé** au lieu de la garder à zéro : sans quoi le stockage
   * finirait par contenir la liste de tout ce qui a un jour été au panier.
   */
  it('une quantité nulle ou négative retire la référence du stockage', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('croissant', 3);
    store.setQuantity('croissant', 0);
    TestBed.flushEffects();

    expect(store.quantities()).toEqual({});
    expect(localStorage.getItem('lfc.cart')).toBe('{}');
  });

  it('n’accepte que des quantités entières', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('croissant', 2.7);

    expect(store.quantityOf('croissant')).toBe(2);
  });

  it('vider efface tout, et l’efface aussi du navigateur', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('croissant', 2);
    store.clear();
    TestBed.flushEffects();

    expect(reload().quantities()).toEqual({});
  });
});
