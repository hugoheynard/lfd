import { describe, expect, it } from 'vitest';

import { CartStore, saleLineOf } from '../cart.store';

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

  /**
   * « Une seule arithmétique » (2026-11-04) : le panier ne somme plus rien.
   * Son sous-total était un second calcul à côté de l'estimation ; les prix de
   * ce client n'y arrivent que par elle (`estimatedLines`).
   */
  it('ne porte aucun montant, et ses lignes gardent le prix du catalogue', () => {
    const cart = new CartStore();
    cart.add(CROISSANT, 10);

    expect('subtotalCents' in cart).toBe(false);
    expect(cart.pricedLines()[0]).toMatchObject({
      unitPriceMillicents: CROISSANT.unitPriceMillicents,
      canonicalPriceMillicents: null,
    });
  });

  it('n’envoie QUE des SKU et des quantités — jamais un prix', () => {
    // Le piège que ce test ferme : un jour où le payload emporterait le prix
    // affiché, le back-office deviendrait une source de prix concurrente.
    const cart = new CartStore();
    cart.add(CROISSANT, 3);

    expect(cart.toPayloadLines()).toEqual([{ sku: 'VIE-001', quantity: 3 }]);
  });

  it('ramène une quantité fractionnaire à l’entier le plus proche — on ne commande pas 2,7 croissants', () => {
    // Elle était tronquée (2) ; depuis le 2026-11-03, la règle unique ramène
    // au multiple du pas le PLUS PROCHE, comme la rangée.
    const cart = new CartStore();
    cart.add(CROISSANT, 4);

    cart.setQuantity('VIE-001', 2.7);

    expect(cart.quantityOf('VIE-001')).toBe(3);
  });

  /**
   * Décision Hugo du 2026-11-03 : le panier tient lui-même le plancher et le
   * pas — une rangée ou une ligne de panier qui enverrait une quantité hors
   * règle ne doit pas pouvoir la poser.
   */
  describe('le plancher et le pas, tenus par le panier', () => {
    const PAIN_MIN = { ...BAGUETTE, minimum: 10 };
    const GRAVLAX = {
      sku: 'SAU-001',
      name: 'Saumon gravlax',
      unitPriceMillicents: 4_200_000,
      saleUnit: 'weight' as const,
      step: 100,
      minimum: 250,
    };

    it('remonte au plancher une pièce ajoutée sous son minimum', () => {
      const cart = new CartStore();
      cart.add(PAIN_MIN, 3);
      expect(cart.quantityOf('PAI-001')).toBe(10);
    });

    it('remonte au plancher une quantité fixée sous le minimum, sans retirer la ligne', () => {
      const cart = new CartStore();
      cart.add(PAIN_MIN, 12);
      cart.setQuantity('PAI-001', 4);
      expect(cart.quantityOf('PAI-001')).toBe(10);
    });

    it('retire la ligne à 0, même avec un minimum', () => {
      const cart = new CartStore();
      cart.add(PAIN_MIN, 12);
      cart.setQuantity('PAI-001', 0);
      expect(cart.isEmpty()).toBe(true);
    });

    it('au poids, part du premier multiple du pas qui atteint le minimum', () => {
      const cart = new CartStore();
      cart.add(GRAVLAX, 100);
      expect(cart.quantityOf('SAU-001')).toBe(300);
    });

    it('au poids, ramène une saisie hors pas au multiple le plus proche', () => {
      const cart = new CartStore();
      cart.add(GRAVLAX, 500);
      cart.setQuantity('SAU-001', 1_234);
      expect(cart.quantityOf('SAU-001')).toBe(1_200);
      cart.setQuantity('SAU-001', 1_260);
      expect(cart.quantityOf('SAU-001')).toBe(1_300);
    });

    it('au poids, le cumul reste sur le pas', () => {
      const cart = new CartStore();
      cart.add(GRAVLAX, 300);
      cart.add(GRAVLAX, 300);
      expect(cart.quantityOf('SAU-001')).toBe(600);
    });

    it('accepte un colis entier sur une pièce : son pas au panier est 1', () => {
      // Le colis est un choix de la rangée ; la ligne ne le garde pas.
      const cart = new CartStore();
      cart.add(PAIN_MIN, 12);
      cart.add(PAIN_MIN, 6);
      expect(cart.quantityOf('PAI-001')).toBe(18);
    });
  });

  /**
   * P5 (`vente-au-poids.md`) : une ligne au poids compte des grammes. Lus
   * en pièces, 1 250 g d'un saumon à 42 €/kg auraient affiché 52 500 €.
   */
  describe('une ligne au poids', () => {
    const GRAVLAX = {
      sku: 'SAU-001',
      name: 'Saumon gravlax',
      unitPriceMillicents: 4_200_000, // 42,00 € HT le kilo
      saleUnit: 'weight' as const,
      // Au pas de 50 g : 1 250 g est sur la grille, le panier le garde tel quel.
      step: 50,
      minimum: 300,
    };

    it('compte pour UN article, jamais pour ses grammes', () => {
      const cart = new CartStore();
      cart.add(GRAVLAX, 1_250);
      cart.add(CROISSANT, 3);

      expect(cart.itemCount()).toBe(4);
    });

    it('part avec son unité ; une pièce part comme avant', () => {
      const cart = new CartStore();
      cart.add(GRAVLAX, 500);
      cart.add(CROISSANT, 3);

      expect(cart.toPayloadLines()).toEqual([
        { sku: 'SAU-001', quantity: 500, saleUnit: 'weight' },
        { sku: 'VIE-001', quantity: 3 },
      ]);
    });
  });

  /** Plan `catalogue/plan-quantite-minimale.md`, Q6 : la ligne garde son plancher. */
  describe('le minimum de pièces', () => {
    it('garde le minimum d’une pièce, et rien d’autre', () => {
      expect(saleLineOf({ minimum: 6 })).toEqual({ minimum: 6 });
      expect(saleLineOf({ saleUnit: 'piece', minimum: 6 })).toEqual({ minimum: 6 });
    });

    it('ne garde rien pour une pièce sans minimum', () => {
      expect(saleLineOf({})).toEqual({});
      expect(saleLineOf({ minimum: 1 })).toEqual({});
    });

    it('garde l’unité, le pas et le minimum d’un article au poids', () => {
      expect(saleLineOf({ saleUnit: 'weight', step: 100, minimum: 300 })).toEqual({
        saleUnit: 'weight',
        step: 100,
        minimum: 300,
      });
    });
  });
});
