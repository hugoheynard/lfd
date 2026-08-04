import { describe, expect, it } from 'vitest';

import { backendToProduct } from './product-http-api';

interface BackendVariantLike {
  id: string;
  sku: string;
  name: { fr: string };
  isDefault: boolean;
  isDiscontinued: boolean;
  priceCents: number | null;
  weightGrams: number | null;
  allergens: readonly string[] | null;
}

function backendProduct(overrides: Partial<BackendVariantLike> = {}) {
  const variant: BackendVariantLike = {
    id: 'prd_cafe_v1',
    sku: 'CAFE-1',
    name: { fr: 'Café' },
    isDefault: true,
    isDiscontinued: false,
    priceCents: 450,
    weightGrams: 250,
    allergens: null,
    ...overrides,
  };
  return {
    id: 'prd_cafe',
    sku: 'CAFE',
    name: { fr: 'Café' },
    slug: { fr: 'cafe' },
    kind: 'resale' as const,
    categoryId: 'cat_choco',
    status: 'draft' as const,
    variants: [variant],
  };
}

describe('backendToProduct', () => {
  it('mappe le prix de la déclinaison par défaut (centimes → euros)', () => {
    const product = backendToProduct(backendProduct());
    expect(product.priceEur).toBe(4.5);
    expect(product.weightGrams).toBe(250);
  });

  it('omet priceEur quand la déclinaison n’est pas tarifée (null)', () => {
    const product = backendToProduct(backendProduct({ priceCents: null }));
    expect(product.priceEur).toBeUndefined();
  });

  it('neutralise channelsOverride et workflowFlags (différés)', () => {
    const product = backendToProduct(backendProduct());
    expect(product.channelsOverride).toBeNull();
    expect(product.workflowFlags).toEqual([]);
  });

  it('n’a pas de descriptionFr sans éditorial', () => {
    const product = backendToProduct(backendProduct());
    expect(product.descriptionFr).toBeUndefined();
  });

  it('remonte descriptionFr depuis l’éditorial enrichi', () => {
    const product = backendToProduct(backendProduct(), {
      descriptionShort: 'Torréfaction douce',
    });
    expect(product.descriptionFr).toBe('Torréfaction douce');
  });

  it('ignore un éditorial vide', () => {
    const product = backendToProduct(backendProduct(), { descriptionShort: '' });
    expect(product.descriptionFr).toBeUndefined();
  });

  it('mappe les déclinaisons (allergènes copiés)', () => {
    const product = backendToProduct(
      backendProduct({ allergens: ['TBD_BARLEY'] }),
    );
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]?.allergens).toEqual(['TBD_BARLEY']);
    expect(product.variants[0]?.isDefault).toBe(true);
  });
});
