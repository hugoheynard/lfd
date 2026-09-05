import type { ShopItemView } from '@lfd/contracts';

import { type CartLine, priceCart, ttcMillicentsOf } from './cart-total';
import { TEST_ITEMS } from '../shop/shop-catalogue.fixture';

/**
 * Le décompte du panier compte en **centimes entiers**, jamais en euros
 * flottants : c'est l'unité du serveur, et deux unités pour le même nombre
 * finissent toujours par donner deux nombres.
 *
 * Les prix du catalogue sont **hors taxe** ; la vitrine affiche du TTC. La
 * conversion se fait une fois, en arithmétique exacte.
 */
const item = (over: Partial<ShopItemView> = {}): ShopItemView => ({
  sku: 'VIE-001',
  name: 'Croissant au beurre',
  note: null,
  image: null,
  unitPriceMillicents: 100_000,
  vatRatePercent: 5.5,
  shelfId: 'cat_vien',
  isFeatured: false,
  ...over,
});

const line = (product: ShopItemView, quantity: number): CartLine => ({ product, quantity });

describe('ttcMillicentsOf', () => {
  it('ajoute la TVA au prix hors taxe du catalogue', () => {
    // 1,00 € HT à 5,5 % → 1,055 € TTC, soit 105 500 millicentimes.
    expect(ttcMillicentsOf(item())).toBe(105_500);
  });

  it('suit le taux de CHAQUE article, jamais un taux supposé', () => {
    expect(ttcMillicentsOf(item({ vatRatePercent: 10 }))).toBe(110_000);
    expect(ttcMillicentsOf(item({ vatRatePercent: 20 }))).toBe(120_000);
  });

  /**
   * 🔴 Le millicentime existe pour ça : 1,00 € HT à 5,5 % ne tombe pas sur un
   * centime rond. Arrondir ici jetterait la fraction sur CHAQUE pièce.
   */
  it('ne rogne pas la fraction de centime au prix unitaire', () => {
    expect(ttcMillicentsOf(item())).not.toBe(106_000);
  });
});

describe('priceCart', () => {
  it('additionne les lignes et n’enlève rien sans remise', () => {
    const totals = priceCart([line(item(), 4)], 0, 0);

    // 4 × 1,055 € = 4,22 €.
    expect(totals.subtotalCents).toBe(422);
    expect(totals.discountCents).toBe(0);
    expect(totals.totalCents).toBe(422);
  });

  /**
   * 🔴 **L'arrondi a lieu UNE fois, au total de ligne.** Quatre croissants à
   * 1,055 € font 4,22 € — pas 4 × 1,06 € = 4,24 €. C'est l'écart que le
   * millicentime existe pour supprimer, et il se voit dès la troisième pièce.
   */
  it('arrondit au total de ligne, jamais à l’unité multipliée', () => {
    const four = priceCart([line(item(), 4)], 0, 0);
    const oneByOne = 4 * priceCart([line(item(), 1)], 0, 0).subtotalCents;

    expect(four.subtotalCents).toBe(422);
    expect(oneByOne).toBe(424);
  });

  it('calcule la TVA sur le NET, après remise', () => {
    const withoutDiscount = priceCart([line(item(), 10)], 0, 0);
    const withDiscount = priceCart([line(item(), 10)], 10, 0);

    // 10,55 € TTC remisés de 10 % → 9,50 € (arrondi), dont 5,5 % de TVA.
    expect(withoutDiscount.subtotalCents).toBe(1055);
    // 10,55 € − 10 % = 9,495 € → 9,50 €, l'arrondi s'éloignant de zéro.
    expect(withDiscount.discountCents).toBe(105);
    expect(withDiscount.totalCents).toBe(950);
    expect(withDiscount.vat[0]?.amountCents).toBeLessThan(withoutDiscount.vat[0]?.amountCents ?? 0);
  });

  it('n’affiche pas de ligne de TVA pour un taux absent du panier', () => {
    expect(priceCart([line(item(), 2)], 0, 0).vat.map((share) => share.rate)).toEqual([5.5]);
  });

  it('sépare les deux taux dès que le salé entre au panier', () => {
    const mixed = priceCart(
      [line(item(), 2), line(item({ sku: 'SAL-001', vatRatePercent: 10 }), 1)],
      0,
      0,
    );

    expect(mixed.vat.map((share) => share.rate)).toEqual([5.5, 10]);
  });

  it('ajoute les frais de coursier APRÈS la remise, et hors TVA du panier', () => {
    const delivered = priceCart([line(item(), 10)], 10, 2000);

    expect(delivered.feeCents).toBe(2000);
    expect(delivered.totalCents).toBe(950 + 2000);
  });

  it('rend un panier vide sans aucune ligne de TVA', () => {
    const empty = priceCart([], 10, 0);

    expect(empty.subtotalCents).toBe(0);
    expect(empty.vat).toEqual([]);
    expect(empty.totalCents).toBe(0);
  });

  /** Le décompte lit ce que le CATALOGUE rend, pas une copie locale. */
  it('compte sur les articles du catalogue hydraté', () => {
    const first = TEST_ITEMS[0];
    expect(first).toBeDefined();

    const totals = priceCart([line(first as ShopItemView, 1)], 0, 0);
    expect(totals.subtotalCents).toBeGreaterThan(0);
  });
});
