import type { CatalogItemView } from '@lfd/contracts';
import { lineTotalCents } from '@lfd/money';

import {
  firstSaleQuantityOf,
  lineSaleQuantity,
  saleQuantityLabel,
  saleStepOf,
} from '../sale-terms';
import { toCatalogProduct } from '../to-catalog-product';

/** Un saumon à 42,00 € HT le kilo, au pas de 100 g, 250 g au moins (`plan-vente-au-poids.md`, P5). */
const GRAVLAX: CatalogItemView = {
  sku: 'SAU-001',
  name: 'Saumon gravlax',
  unitPriceMillicents: 4_200_000,
  vatRate: 5.5,
  family: null,
  category: null,
  saleUnit: 'weight',
  weightStepGrams: 100,
  weightMinGrams: 250,
};

const CROISSANT: CatalogItemView = {
  sku: 'VIE-001',
  name: 'Croissant',
  unitPriceMillicents: 120_000,
  vatRate: 5.5,
  family: null,
  category: null,
};

describe('sale-terms — une quantité dans l’unité de l’article', () => {
  it('une pièce : un pas d’un, une première quantité d’un — absente du fil comme servie', () => {
    expect(saleStepOf(CROISSANT)).toBe(1);
    expect(firstSaleQuantityOf(CROISSANT)).toBe(1);
    expect(firstSaleQuantityOf({ ...CROISSANT, saleUnit: 'piece' })).toBe(1);
  });

  it('au poids : le pas de l’article, et le premier multiple du pas qui atteint le minimum', () => {
    expect(saleStepOf(GRAVLAX)).toBe(100);
    expect(firstSaleQuantityOf(GRAVLAX)).toBe(300);
    expect(firstSaleQuantityOf({ ...GRAVLAX, weightMinGrams: null })).toBe(100);
  });

  it('au poids sans pas : aucun geste plutôt qu’un pas inventé', () => {
    expect(saleStepOf({ ...GRAVLAX, weightStepGrams: null })).toBeNull();
    expect(firstSaleQuantityOf({ ...GRAVLAX, weightStepGrams: null })).toBeNull();
  });

  it('dit des grammes sous le kilo et des kilos au-delà ; une pièce reste un nombre', () => {
    expect(saleQuantityLabel(500, 'weight')).toBe('500 g');
    expect(saleQuantityLabel(1_250, 'weight')).toBe('1,25 kg');
    expect(saleQuantityLabel(12, 'piece')).toBe('12');
    expect(saleQuantityLabel(12, undefined)).toBe('12');
  });

  /** Régression évitée : 1 250 g lus en pièces font mille fois le prix. */
  it('chiffre une ligne au poids au kilo : 1,25 kg à 42 €/kg font 52,50 €', () => {
    expect(lineTotalCents(4_200_000, lineSaleQuantity(1_250, 'weight'))).toBe(5_250);
  });
});

describe('toCatalogProduct — un article au poids', () => {
  it('dit « / kg », son pas et son minimum, sans colisage', () => {
    expect(toCatalogProduct(GRAVLAX)).toMatchObject({
      unit: '/ kg',
      saleUnit: 'weight',
      step: 100,
      minimum: 300,
    });
  });

  it('sans pas, ne se propose pas à l’ajout', () => {
    expect(toCatalogProduct({ ...GRAVLAX, weightStepGrams: null })).toMatchObject({
      outOfStock: true,
    });
  });

  it('une pièce reste telle qu’avant', () => {
    expect(toCatalogProduct(CROISSANT)).toEqual({
      id: 'VIE-001',
      name: 'Croissant',
      price: toCatalogProduct(CROISSANT).price,
    });
  });
});
