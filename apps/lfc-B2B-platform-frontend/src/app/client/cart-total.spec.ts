import { type CartLine, formatEuro, formatRate, priceCart } from './cart-total';
import { productById } from './mock-shop';

function line(id: string, quantity: number): CartLine {
  const product = productById(id);
  if (!product) {
    throw new Error(`Produit inconnu dans le montage de test : ${id}`);
  }
  return { product, quantity };
}

describe('priceCart', () => {
  it('additionne les lignes et n’enlève rien sans remise', () => {
    const totals = priceCart([line('croissant', 4), line('tradition', 2)], 0, 0);

    expect(totals.subtotal).toBeCloseTo(8.2, 5);
    expect(totals.discount).toBe(0);
    expect(totals.total).toBeCloseTo(8.2, 5);
  });

  it('calcule la TVA sur le net APRÈS remise, pas sur le brut', () => {
    const withoutDiscount = priceCart([line('croissant', 10)], 0, 0);
    const withDiscount = priceCart([line('croissant', 10)], 10, 0);

    // 14 € TTC à 5,5 % → 0,73 € ; remisés à 12,60 € → 0,66 €.
    expect(withoutDiscount.vat[0]?.amount).toBeCloseTo((14 * 5.5) / 105.5, 5);
    expect(withDiscount.vat[0]?.amount).toBeCloseTo((12.6 * 5.5) / 105.5, 5);
    expect(withDiscount.total).toBeCloseTo(12.6, 5);
  });

  it('n’affiche pas de ligne de TVA pour un taux absent du panier', () => {
    const sweet = priceCart([line('croissant', 2)], 0, 0);

    expect(sweet.vat.map((v) => v.rate)).toEqual([5.5]);
  });

  it('sépare les deux taux dès que le salé entre au panier', () => {
    const mixed = priceCart([line('croissant', 2), line('quiche', 1)], 0, 0);

    expect(mixed.vat.map((v) => v.rate)).toEqual([5.5, 10]);
    expect(mixed.vat[1]?.amount).toBeCloseTo((4.5 * 10) / 110, 5);
  });

  it('ajoute les frais de coursier APRÈS la remise, et hors TVA du panier', () => {
    const delivered = priceCart([line('croissant', 10)], 10, 20);

    expect(delivered.total).toBeCloseTo(32.6, 5);
    expect(delivered.vat[0]?.amount).toBeCloseTo((12.6 * 5.5) / 105.5, 5);
  });

  it('rend un panier vide sans aucune ligne de TVA', () => {
    const empty = priceCart([], 10, 0);

    expect(empty.subtotal).toBe(0);
    expect(empty.vat).toEqual([]);
    expect(empty.total).toBe(0);
  });
});

describe('formatEuro', () => {
  it('écrit la virgule décimale et garde les deux décimales', () => {
    expect(formatEuro(5.5)).toBe('5,50 €');
    expect(formatEuro(16.375)).toBe('16,38 €');
  });
});

describe('formatRate', () => {
  it('ne colle pas de décimale à un taux entier', () => {
    expect(formatRate(5.5)).toBe('5,5 %');
    expect(formatRate(10)).toBe('10 %');
  });
});
