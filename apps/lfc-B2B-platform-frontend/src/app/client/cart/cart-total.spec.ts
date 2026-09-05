import type { ShopItemView } from '@lfd/contracts';

import { type CartLine, priceCart } from './cart-total';
import { TEST_ITEMS } from '../shop/shop-catalogue.fixture';

/**
 * Le décompte du panier compte en **centimes entiers**, jamais en euros
 * flottants : c'est l'unité du serveur, et deux unités pour le même nombre
 * finissent toujours par donner deux nombres.
 *
 * Les prix du catalogue sont **hors taxe**, et le décompte le reste jusqu'au
 * total : sous-total HT, remise ou coursier, une ligne par taux, total TTC.
 * C'est l'ordre d'une facture, et c'est celui que la caisse applique.
 */
const item = (over: Partial<ShopItemView> = {}): ShopItemView => ({
  sku: 'VIE-001',
  name: 'Croissant au beurre',
  note: null,
  image: null,
  // 1,00 € HT.
  unitPriceMillicents: 100_000,
  vatRatePercent: 5.5,
  shelfId: 'cat_vien',
  isFeatured: false,
  ...over,
});

const line = (product: ShopItemView, quantity: number): CartLine => ({ product, quantity });

describe('priceCart', () => {
  it('additionne les lignes hors taxe et n’enlève rien sans remise', () => {
    const totals = priceCart([line(item(), 4)], 0, 0);

    // 4 × 1,00 € HT = 4,00 € ; TVA 5,5 % = 0,22 € ; TTC 4,22 €.
    expect(totals.subtotalHtCents).toBe(400);
    expect(totals.discountCents).toBe(0);
    expect(totals.vat).toEqual([{ rate: 5.5, amountCents: 22 }]);
    expect(totals.totalCents).toBe(422);
  });

  /**
   * 🔴 **L'arrondi a lieu UNE fois, au total de ligne.** Quatre pièces à
   * 1,055 € HT font 4,22 € — pas 4 × 1,06 € = 4,24 €. C'est l'écart que le
   * millicentime existe pour supprimer, et il se voit dès la troisième pièce.
   */
  it('arrondit au total de ligne, jamais à l’unité multipliée', () => {
    const odd = item({ unitPriceMillicents: 105_500 });
    const four = priceCart([line(odd, 4)], 0, 0);
    const oneByOne = 4 * priceCart([line(odd, 1)], 0, 0).subtotalHtCents;

    expect(four.subtotalHtCents).toBe(422);
    expect(oneByOne).toBe(424);
  });

  it('applique la remise au HORS TAXE, et la TVA sur le net', () => {
    const discounted = priceCart([line(item(), 10)], 10, 0);

    // 10,00 € HT − 10 % = 9,00 € ; 9,00 × 5,5 % = 0,495 → 0,50 € ; TTC 9,50 €.
    expect(discounted.subtotalHtCents).toBe(1000);
    expect(discounted.discountCents).toBe(100);
    expect(discounted.vat).toEqual([{ rate: 5.5, amountCents: 50 }]);
    expect(discounted.totalCents).toBe(950);
  });

  it('n’affiche pas de ligne de TVA pour un taux absent du panier', () => {
    expect(priceCart([line(item(), 2)], 0, 0).vat.map((share) => share.rate)).toEqual([5.5]);
  });

  it('sépare les taux dès que le salé entre au panier', () => {
    const mixed = priceCart(
      [line(item(), 2), line(item({ sku: 'SAL-001', vatRatePercent: 10 }), 1)],
      0,
      0,
    );

    expect(mixed.vat.map((share) => share.rate)).toEqual([5.5, 10]);
  });

  it('rend un panier vide sans aucune ligne de TVA', () => {
    const empty = priceCart([], 10, 0);

    expect(empty.subtotalHtCents).toBe(0);
    expect(empty.vat).toEqual([]);
    expect(empty.totalCents).toBe(0);
  });

  /** Le décompte lit ce que le CATALOGUE rend, pas une copie locale. */
  it('compte sur les articles du catalogue hydraté', () => {
    const first = TEST_ITEMS[0];
    expect(first).toBeDefined();

    const totals = priceCart([line(first as ShopItemView, 1)], 0, 0);
    expect(totals.subtotalHtCents).toBeGreaterThan(0);
  });
});

describe('le coursier', () => {
  /**
   * 🔴 **Régression : les frais de coursier n'étaient pas taxés.**
   *
   * Le décompte comptait en TTC et ajoutait les frais APRÈS la TVA — donc
   * jamais dessus. La caisse, elle, les taxe à 20 % (prestation de transport,
   * taux normal). Sur des frais de 20 €, l'écran annonçait 4 € de moins que ce
   * qui allait être débité : un client voyait un prix et en payait un autre.
   */
  it('porte sa TVA à 20 %, comme la caisse la facture', () => {
    const delivered = priceCart([line(item(), 10)], 10, 2000);

    expect(delivered.feeCents).toBe(2000);
    expect(delivered.vat).toEqual([
      { rate: 5.5, amountCents: 50 },
      { rate: 20, amountCents: 400 },
    ]);
    // 9,00 € net + 20,00 € de frais + 4,50 € de TVA.
    expect(delivered.totalCents).toBe(3350);
  });

  /**
   * La ligne à 20 % apparaît sur un panier qui ne contient que du pain. C'est
   * contre-intuitif et c'est exact : c'est la LIVRAISON qui la fait exister.
   */
  it('fait apparaître un taux qu’aucune marchandise ne porte', () => {
    const bread = priceCart([line(item(), 1)], 0, 500);

    expect(bread.vat.map((share) => share.rate)).toEqual([5.5, 20]);
  });

  /** On ne fait pas de geste commercial sur une prestation de transport. */
  it('n’est pas remisé avec la marchandise', () => {
    const delivered = priceCart([line(item(), 10)], 100, 2000);

    // Marchandises entièrement remisées → aucune TVA ; les frais gardent la leur.
    expect(delivered.vat).toEqual([{ rate: 20, amountCents: 400 }]);
    expect(delivered.totalCents).toBe(2400);
  });

  /** Pas de frais, pas de ligne : le retrait est toujours gratuit. */
  it('n’ajoute rien au retrait', () => {
    expect(priceCart([line(item(), 1)], 0, 0).vat.map((s) => s.rate)).toEqual([5.5]);
  });
});
