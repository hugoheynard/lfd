import { describe, expect, it } from 'vitest';

import { CartStore } from '../cart.store';

/**
 * 🔴 **De vrais millicentimes**, et c'est le sujet de deux tests plus bas.
 *
 * Ces deux constantes portaient `200` et `180` — des valeurs en CENTIMES dans un
 * champ de millicentimes. La suite était verte pendant que l'écran affichait
 * mille fois le prix : le test et le code étaient faux ensemble, ce qui est la
 * seule façon pour un défaut d'unité de survivre à une suite.
 */
const CROISSANT = { sku: 'VIE-001', name: 'Croissant', unitPriceMillicents: 200_000 }; // 2,00 € HT
const BAGUETTE = { sku: 'PAI-001', name: 'Baguette', unitPriceMillicents: 180_000 }; // 1,80 € HT

describe('CartStore', () => {
  it('cumule un SKU déjà présent plutôt que d’ouvrir une seconde ligne', () => {
    // Le serveur fusionne par SKU de toute façon : deux lignes du même produit à
    // l'écran donneraient un panier qui ne ressemble pas à la commande produite.
    const cart = new CartStore();

    cart.add(CROISSANT, 10);
    cart.add(CROISSANT, 5);

    expect(cart.lines()).toHaveLength(1);
    expect(cart.quantityOf('VIE-001')).toBe(15);
  });

  it('ignore une quantité nulle ou négative à l’ajout', () => {
    const cart = new CartStore();

    cart.add(CROISSANT, 0);
    cart.add(CROISSANT, -3);

    expect(cart.isEmpty()).toBe(true);
  });

  it('retire la ligne quand la quantité tombe à zéro', () => {
    // Mettre 0 et supprimer sont le même geste pour qui saisit ; en faire deux
    // chemins laisserait des lignes à zéro dans le panier.
    const cart = new CartStore();
    cart.add(CROISSANT, 4);

    cart.setQuantity('VIE-001', 0);

    expect(cart.isEmpty()).toBe(true);
  });

  it('compte des ARTICLES, pas des lignes', () => {
    const cart = new CartStore();
    cart.add(CROISSANT, 10);
    cart.add(BAGUETTE, 4);

    expect(cart.lines()).toHaveLength(2);
    expect(cart.itemCount()).toBe(14);
  });

  it('somme le sous-total HT', () => {
    const cart = new CartStore();
    cart.add(CROISSANT, 10); // 2 000 c
    cart.add(BAGUETTE, 4); // 720 c

    expect(cart.subtotalCents()).toBe(2_720);
  });

  /**
   * Régression : `subtotalCents` sommait `unitPriceMillicents × quantité` et
   * l'écran l'affichait par `formatCents`, qui divise par cent. Dix croissants à
   * 2,00 € HT se lisaient **20 000,00 €** au lieu de 20,00 € (fix 2026-09-06).
   *
   * Le nombre n'a jamais été facturé — le payload ne porte aucun prix, et le
   * serveur re-résout tout. C'est le montant qu'un commercial lit au téléphone.
   */
  it('somme des CENTIMES, pas des millicentimes', () => {
    const cart = new CartStore();
    cart.add(CROISSANT, 10);

    // 20,00 €, et surtout pas 20 000,00 €.
    expect(cart.subtotalCents()).toBe(2_000);
  });

  /**
   * Régression, sur la même ligne et plus discrète : la somme n'arrondissait pas
   * **par ligne**. Le serveur, lui, arrondit une fois par ligne
   * (`OrderLine.lineTotalCents`) — un écran qui arrondit ailleurs annonce un
   * centime que la facture contredit.
   */
  it('arrondit une fois PAR LIGNE, comme la commande', () => {
    const cart = new CartStore();
    // 8,185 € HT : un hors taxe déduit d'un prix d'étiquette tombe sur un demi-
    // centime, et c'est le seul cas où les deux arrondis divergent.
    cart.add({ sku: 'VIE-002', name: 'Chausson', unitPriceMillicents: 818_500 }, 1);
    cart.add({ sku: 'VIE-003', name: 'Pain suisse', unitPriceMillicents: 818_500 }, 1);

    // 819 + 819 — et non l'arrondi de la somme, qui vaudrait 1 637.
    expect(cart.subtotalCents()).toBe(1_638);
  });

  it('n’envoie QUE des SKU et des quantités — jamais un prix', () => {
    // Le piège que ce test ferme : un jour où le payload emporterait le prix
    // affiché, le back-office deviendrait une source de prix concurrente.
    const cart = new CartStore();
    cart.add(CROISSANT, 3);

    expect(cart.toPayloadLines()).toEqual([{ sku: 'VIE-001', quantity: 3 }]);
  });

  it('tronque une quantité fractionnaire — on ne commande pas 2,5 croissants', () => {
    const cart = new CartStore();
    cart.add(CROISSANT, 4);

    cart.setQuantity('VIE-001', 2.7);

    expect(cart.quantityOf('VIE-001')).toBe(2);
  });
});
