import {
  firstQuantityOf,
  lineTotalOf,
  nextQuantity,
  previousQuantity,
  quantityLabel,
  requestedLine,
  stepOf,
  type SaleTerms,
} from './sale-unit';

/** P4 de `plan-vente-au-poids.md` : la boutique compte en grammes, au pas de l'article. */
describe('sale-unit', () => {
  const piece: SaleTerms = {};
  const byWeight = (step: number | null, min: number | null): SaleTerms => ({
    saleUnit: 'weight',
    weightStepGrams: step,
    weightMinGrams: min,
  });

  it('une pièce avance d’une pièce, à partir d’une', () => {
    expect(stepOf(piece)).toBe(1);
    expect(firstQuantityOf(piece)).toBe(1);
    expect(nextQuantity(piece, 0)).toBe(1);
    expect(nextQuantity(piece, 3)).toBe(4);
    expect(previousQuantity(piece, 1)).toBe(0);
  });

  it('au poids sans minimum, part du pas et avance du pas', () => {
    const item = byWeight(100, null);
    expect(firstQuantityOf(item)).toBe(100);
    expect(nextQuantity(item, 0)).toBe(100);
    expect(nextQuantity(item, 100)).toBe(200);
  });

  it('au poids avec minimum, part du minimum et le retire en dessous', () => {
    const item = byWeight(50, 200);
    expect(nextQuantity(item, 0)).toBe(200);
    expect(nextQuantity(item, 200)).toBe(250);
    expect(previousQuantity(item, 250)).toBe(200);
    expect(previousQuantity(item, 200)).toBe(0);
  });

  it('un minimum hors du pas part du premier multiple qui l’atteint', () => {
    expect(firstQuantityOf(byWeight(100, 250))).toBe(300);
  });

  it('un article au poids sans pas ne s’ajoute pas', () => {
    const item = byWeight(null, null);
    expect(firstQuantityOf(item)).toBeNull();
    expect(nextQuantity(item, 0)).toBe(0);
  });

  it('dit la quantité : un nombre, ou des grammes puis des kilos', () => {
    expect(quantityLabel(3, 'piece')).toBe('3');
    expect(quantityLabel(500, 'weight')).toBe('500 g');
    expect(quantityLabel(1250, 'weight')).toBe('1,25 kg');
  });

  it('calcule le total au kilo : 12,40 € / kg × 500 g = 6,20 €', () => {
    expect(lineTotalOf(1_240_000, 500, 'weight')).toBe(620);
    expect(lineTotalOf(140_000, 3, 'piece')).toBe(420);
  });

  it('envoie l’unité d’une ligne au poids, et rien de plus pour une pièce', () => {
    expect(requestedLine('SAU-001', 500, byWeight(50, null))).toEqual({
      sku: 'SAU-001',
      quantity: 500,
      saleUnit: 'weight',
    });
    expect(requestedLine('VIE-001', 2, piece)).toEqual({ sku: 'VIE-001', quantity: 2 });
  });
});
