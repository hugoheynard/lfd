import type { ChannelCategory } from '../../../../catalogue/domain/ports/catalogue-reader.js';
import type {
  ProductRecord,
  VariantRecord,
} from '../../../../catalogue/domain/ports/product.repository.js';
import { projectCatalog } from '../projection.js';

const AT = '2026-08-17T08:00:00.000Z';

function variant(over: Partial<VariantRecord> = {}): VariantRecord {
  return {
    id: 'var_1',
    sku: 'VIE-001-1',
    name: { fr: 'Croissant' },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 200,
    weightGrams: null,
    allergens: null,
    nutrition: null,
    ...over,
  };
}

function product(over: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: 'prd_1',
    sku: 'VIE-001',
    name: { fr: 'Croissant' },
    slug: { fr: 'croissant' },
    kind: 'daily',
    categoryId: 'cat_vien',
    status: 'published',
    variants: [variant()],
    ...over,
  };
}

function category(over: Partial<ChannelCategory> = {}): ChannelCategory {
  return {
    id: 'cat_vien',
    name: { fr: 'Viennoiseries' },
    slug: { fr: 'viennoiseries' },
    parentId: null,
    position: 0,
    emporterVatPercent: 5.5,
    ...over,
  };
}

describe('projectCatalog', () => {
  it('projette un produit tarifé, avec le taux de TVA de sa famille', () => {
    const { snapshot, excluded } = projectCatalog(
      [product()],
      [category()],
      AT,
    );

    expect(excluded).toEqual([]);
    expect(snapshot.generatedAt).toBe(AT);
    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.products[0]?.variants[0]?.priceCents).toBe(200);
    expect(snapshot.categories[0]?.vatRatePercent).toBe(5.5);
  });

  it('ne lit aucune horloge : l’instant d’émission est celui qu’on lui passe', () => {
    const { snapshot } = projectCatalog([product()], [category()], AT);

    expect(snapshot.generatedAt).toBe(AT);
  });

  it('écarte une déclinaison sans prix, et le DIT', () => {
    const priceless = product({
      variants: [variant({ sku: 'VIE-001-1', priceCents: null })],
    });

    const { snapshot, excluded } = projectCatalog(
      [priceless],
      [category()],
      AT,
    );

    expect(excluded).toContainEqual({
      sku: 'VIE-001-1',
      reason: 'variant_sans_prix',
    });
    expect(snapshot.products).toEqual([]);
  });

  it('distingue « arrêtée » d’« oubli de prix » — seul le second est actionnable', () => {
    const mixed = product({
      variants: [
        variant({ sku: 'A', isDiscontinued: true }),
        variant({ sku: 'B', priceCents: null }),
        variant({ sku: 'C', priceCents: 300 }),
      ],
    });

    const { snapshot, excluded } = projectCatalog([mixed], [category()], AT);

    expect(excluded).toContainEqual({ sku: 'A', reason: 'variant_arretee' });
    expect(excluded).toContainEqual({ sku: 'B', reason: 'variant_sans_prix' });
    expect(snapshot.products[0]?.variants.map((v) => v.sku)).toEqual(['C']);
  });

  it('écarte un produit dont plus aucune déclinaison n’est vendable', () => {
    const dead = product({
      variants: [variant({ sku: 'A', isDiscontinued: true })],
    });

    const { snapshot, excluded } = projectCatalog([dead], [category()], AT);

    expect(excluded).toContainEqual({
      sku: 'VIE-001',
      reason: 'produit_sans_variante_vendable',
    });
    expect(snapshot.products).toEqual([]);
  });

  /**
   * Une famille non réglée ne bloque plus le voyage : le prix canonique a de la
   * valeur sans le taux, et un écran de paramétrage n'a pas besoin de savoir
   * facturer. Le refus n'a pas disparu, il est déplacé — c'est la BOUTIQUE qui
   * écarte un article sans taux, jamais un défaut à 5,5 %.
   */
  it('pousse un produit dont la famille n’a pas de TVA, avec un taux null', () => {
    const { snapshot, excluded } = projectCatalog(
      [product()],
      [category({ emporterVatPercent: null })],
      AT,
    );

    expect(excluded).toEqual([]);
    expect(snapshot.products).toHaveLength(1);
    expect(snapshot.categories[0]?.vatRatePercent).toBeNull();
  });

  it('écarte un produit dont la famille est inconnue', () => {
    const orphan = product({ categoryId: 'cat_fantome' });

    const { excluded } = projectCatalog([orphan], [category()], AT);

    expect(excluded).toEqual([{ sku: 'VIE-001', reason: 'famille_inconnue' }]);
  });

  it('ne pousse que les familles réellement utilisées', () => {
    const unused = category({ id: 'cat_vide', name: { fr: 'Vide' } });

    const { snapshot } = projectCatalog([product()], [category(), unused], AT);

    expect(snapshot.categories.map((c) => c.id)).toEqual(['cat_vien']);
  });

  it('aplatit les textes en français', () => {
    const bilingual = product({
      name: { fr: 'Croissant', en: 'Croissant' },
    });

    const { snapshot } = projectCatalog([bilingual], [category()], AT);

    expect(snapshot.products[0]?.name).toBe('Croissant');
  });

  it('rend un snapshot vide sans rien inventer quand rien n’est publié', () => {
    const { snapshot, excluded } = projectCatalog([], [category()], AT);

    expect(snapshot.products).toEqual([]);
    expect(snapshot.categories).toEqual([]);
    expect(excluded).toEqual([]);
  });
});
