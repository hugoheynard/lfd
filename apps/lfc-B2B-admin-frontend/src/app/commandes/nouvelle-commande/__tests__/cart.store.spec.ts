import { describe, expect, it } from 'vitest';

import { CartStore } from '../cart.store';

const CROISSANT = { sku: 'VIE-001', name: 'Croissant', unitPriceCents: 200 };
const BAGUETTE = { sku: 'PAI-001', name: 'Baguette', unitPriceCents: 180 };

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
    cart.add(CROISSANT, 10); // 2 000
    cart.add(BAGUETTE, 4); // 720

    expect(cart.subtotalCents()).toBe(2_720);
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
