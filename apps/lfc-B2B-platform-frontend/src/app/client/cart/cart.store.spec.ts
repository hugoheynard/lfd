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
    store.setQuantity('VIE-001', 2);
    store.setQuantity('PAI-001', 1);
    TestBed.flushEffects();

    expect(reload().quantityOf('VIE-001')).toBe(2);
  });

  /**
   * 🔴 **Le dépôt ne connaît plus le catalogue**, et il ne peut plus : celui-ci
   * vient du réseau, et il n'est pas là quand une clé de stockage se relit.
   * Vérifier ici ferait dépendre l'état local d'un serveur joignable.
   *
   * Une référence inconnue est donc RELUE. Elle n'apparaît nulle part pour
   * autant — les lignes se projettent à travers le catalogue — et elle est
   * élaguée dès qu'il arrive : cf. {@link CartStore.keepOnly} et le test du
   * panier qui l'exerce.
   */
  it('relit une référence inconnue plutôt que d’attendre le réseau', () => {
    localStorage.setItem('lfc.cart', JSON.stringify({ 'VIE-001': 2, INCONNU: 3 }));

    const store = reload();
    expect(store.quantityOf('VIE-001')).toBe(2);
    expect(store.quantityOf('INCONNU')).toBe(3);
  });

  it('oublie ce que le catalogue ne connaît plus, quand on le lui dit', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('VIE-001', 2);
    store.setQuantity('INCONNU', 3);

    store.keepOnly(new Set(['VIE-001']));

    expect(store.quantities()).toEqual({ 'VIE-001': 2 });
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
    store.setQuantity('VIE-001', 3);
    store.setQuantity('VIE-001', 0);
    TestBed.flushEffects();

    expect(store.quantities()).toEqual({});
    expect(localStorage.getItem('lfc.cart')).toBe('{}');
  });

  it('n’accepte que des quantités entières', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('VIE-001', 2.7);

    expect(store.quantityOf('VIE-001')).toBe(2);
  });

  it('vider efface tout, et l’efface aussi du navigateur', () => {
    const store = TestBed.inject(CartStore);
    store.setQuantity('VIE-001', 2);
    store.clear();
    TestBed.flushEffects();

    expect(reload().quantities()).toEqual({});
  });
});
