import { describe, expect, it } from 'vitest';

import type { VariantView } from '@lfd/pim-contracts';

import { backendToProduct } from './product-http-api';

/**
 * La déclinaison telle que l'API la rend — le TYPE DU CONTRAT, pas une copie.
 *
 * Cette spec redéclarait sa propre interface, champ pour champ. Elle a dérivé
 * en silence jusqu'à ce que `allergens` devienne `allergenSheet` (séparation
 * des allergènes et de la nutrition, 2026-09-22) : un doublé qui décrit le
 * contrat de mémoire finit par éprouver une forme que le serveur ne sert plus.
 * Prendre `VariantView` rend la dérive impossible.
 */
type BackendVariantLike = VariantView;

function backendProduct(overrides: Partial<BackendVariantLike> = {}) {
  const variant: BackendVariantLike = {
    id: 'prd_cafe_v1',
    sku: 'CAFE-1',
    name: { fr: 'Café' },
    options: {},
    position: 0,
    isDefault: true,
    isDiscontinued: false,
    priceCents: 450,
    weightGrams: 250,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: null,
    nutrition: null,
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
    vatByContext: {},
    channelOverride: null,
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
      descriptionShort: { fr: 'Torréfaction douce' },
    });
    expect(product.descriptionFr).toBe('Torréfaction douce');
  });

  it('ignore un éditorial vide', () => {
    const product = backendToProduct(backendProduct(), { descriptionShort: { fr: '' } });
    expect(product.descriptionFr).toBeUndefined();
  });

  it('mappe les déclinaisons (allergènes copiés)', () => {
    const product = backendToProduct(
      backendProduct({ allergenSheet: { declared: ['GB'], mayContain: [] } }),
    );
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]?.allergens).toEqual(['GB']);
    expect(product.variants[0]?.isDefault).toBe(true);
  });
});

describe('la dérogation de TVA', () => {
  it('voyage TELLE QUELLE — l’écran compose l’héritage, pas le transport', () => {
    // La fusion « fiche par-dessus famille » appartient au magasin, qui connaît
    // les deux. La faire ici priverait l'écran de la provenance, donc du moyen
    // de marquer la ligne et d'y renoncer.
    const product = backendToProduct({ ...backendProduct(), vatByContext: { b2b: 'tva_20' } });

    expect(product.vatByContext).toEqual({ b2b: 'tva_20' });
  });
});
