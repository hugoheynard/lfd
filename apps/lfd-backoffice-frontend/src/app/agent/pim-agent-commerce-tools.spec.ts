import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { UpdateVariantPricingPayload } from '@lfd/pim-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type CategoryDetail, CategoryHttpApi } from '../pim/catalogue/category-http-api';
import {
  type MediaSlot,
  ProductHttpApi,
  type ProductDetail,
} from '../pim/catalogue/product-http-api';
import { VatRateHttpApi } from '../pim/catalogue/vat-rates/vat-http-api';
import { type Category, EMPTY_NUTRITION, type Variant } from '../pim/data/models';

import { declarePimCommerceAgentTools } from './pim-agent-commerce-tools';
import { declarePimReadinessAgentTools } from './pim-agent-readiness-tools';

/** Ce qu'un outil enregistré sait faire, vu du test. */
interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: Record<string, unknown>) => Promise<string>;
}

interface Written {
  readonly route: string;
  readonly body: unknown;
}

function variant(id: string, overrides: Partial<Variant>): Variant {
  return {
    id,
    sku: `SKU-${id}`,
    name: { fr: id },
    isDefault: false,
    isDiscontinued: false,
    position: 1,
    priceCents: 350,
    weightGrams: 80,
    proPriceMillicents: 250000,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    saleUnit: 'piece',
    weightMinGrams: null,
    weightStepGrams: null,
    hasBeenPublished: false,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    minQuantities: { pro: null, public: null },
    minQuantityFollowsDefault: false,
    allergens: ['gluten'],
    mayContain: [],
    nutrition: EMPTY_NUTRITION,
    ...overrides,
  };
}

function detailWith(
  variants: readonly Variant[],
  overrides: Partial<Pick<ProductDetail, 'media'>> & {
    vatByContext?: Readonly<Record<string, string>>;
  } = {},
): ProductDetail {
  return {
    product: {
      id: 'p1',
      sku: 'SKU-P1',
      name: { fr: 'Brioche' },
      kind: 'daily',
      categoryId: 'c1',
      status: 'draft',
      variants: [...variants],
      vatByContext: overrides.vatByContext ?? {},
      operationOnly: false,
      requiresCold: false,
      variantsAsTiles: true,
      audience: null,
    },
    editorial: {
      descriptionShort: null,
      descriptionLong: null,
      story: null,
      pairing: null,
      brand: 'LFC',
      seoTitle: null,
      seoDescription: null,
    },
    allergens: null,
    mayContain: [],
    nutrition: EMPTY_NUTRITION,
    media: overrides.media ?? [{ role: 'hero', url: 'https://x/a.jpg', name: 'a' }],
    readiness: null,
    readinessStale: false,
    lineage: { origin: null, detachedTo: {} },
  };
}

function family(vatByContext: Readonly<Record<string, string>>): Category {
  return {
    id: 'c1',
    name: { fr: 'Viennoiseries' },
    slug: { fr: 'viennoiseries' },
    parentId: null,
    position: 0,
    isArchived: false,
    vatByContext,
    activeProductCount: 1,
    audience: 'both',
  };
}

const REFUSAL = new HttpErrorResponse({
  status: 400,
  error: { message: 'Le prix pro porte six décimales.' },
});

function armTools(
  detail: ProductDetail | null,
  families: readonly Category[] = [family({ takeaway: 'r1', b2b: 'r2' })],
  refuse = false,
) {
  const registered: RegisteredTool[] = [];
  const written: Written[] = [];
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: RegisteredTool): Promise<void> => {
        registered.push(tool);
        return Promise.resolve();
      },
    },
  });
  const write = (route: string, body: unknown): Promise<void> => {
    if (refuse) {
      return Promise.reject(REFUSAL);
    }
    written.push({ route, body });
    return Promise.resolve();
  };
  const products: Pick<
    ProductHttpApi,
    'getDetail' | 'list' | 'savePricing' | 'saveVat' | 'saveMedia' | 'publish' | 'unpublish'
  > = {
    getDetail: () => Promise.resolve(detail),
    list: () => Promise.resolve(detail === null ? [] : [detail.product]),
    savePricing: (_id, _vid, body: UpdateVariantPricingPayload) => write('pricing', body),
    saveVat: (_id, body) => write('product-vat', body),
    saveMedia: (_id, body: readonly MediaSlot[]) => write('media', body),
    publish: (id) => write('publish', id),
    unpublish: (id) => write('unpublish', id),
  };
  const categories: Pick<CategoryHttpApi, 'list' | 'detail' | 'setVat'> = {
    list: () => Promise.resolve([...families]),
    detail: (): Promise<CategoryDetail> =>
      Promise.resolve({
        ...family({ takeaway: 'r1', eatIn: 'r3' }),
        editorial: null,
        media: [],
      }),
    setVat: (_id, body) => write('category-vat', body),
  };
  const rates: Pick<VatRateHttpApi, 'list'> = {
    list: () =>
      Promise.resolve([{ id: 'r1', name: 'Réduit', description: '', percent: 5.5, usage: {} }]),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductHttpApi, useValue: products },
      { provide: CategoryHttpApi, useValue: categories },
      { provide: VatRateHttpApi, useValue: rates },
    ],
  });
  runInInjectionContext(TestBed.inject(Injector), () => {
    declarePimCommerceAgentTools();
    declarePimReadinessAgentTools();
  });
  const tool = (name: string): RegisteredTool => {
    const found = registered.find((row) => row.name === name);
    if (found === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    return found;
  };
  return { tool, written };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

describe('pim_variant_set_pricing', () => {
  it('garde le poids et le prix pro quand seul le prix public est donné', async () => {
    const { tool, written } = armTools(detailWith([variant('v1', { isDefault: true })]));
    await tool('pim_variant_set_pricing').execute({
      productId: 'p1',
      variantId: 'v1',
      priceCents: 420,
    });
    // `proPriceHt` absent = inchangé côté serveur : il ne doit pas partir.
    expect(written).toEqual([{ route: 'pricing', body: { priceCents: 420, weightGrams: 80 } }]);
  });

  it('envoie le prix pro en texte, et "" l’efface', async () => {
    const { tool, written } = armTools(detailWith([variant('v1', { isDefault: true })]));
    await tool('pim_variant_set_pricing').execute({
      productId: 'p1',
      variantId: 'v1',
      proPriceHt: '12.34',
    });
    await tool('pim_variant_set_pricing').execute({
      productId: 'p1',
      variantId: 'v1',
      proPriceHt: '',
    });
    expect(written.map((w) => w.body)).toEqual([
      { priceCents: 350, weightGrams: 80, proPriceHt: '12.34' },
      { priceCents: 350, weightGrams: 80, proPriceHt: null },
    ]);
  });

  it('refuse une déclinaison qui suit le tarif du défaut', async () => {
    const { tool, written } = armTools(
      detailWith([
        variant('v1', { isDefault: true }),
        variant('v2', { pricingFollowsDefault: true }),
      ]),
    );
    const said = await tool('pim_variant_set_pricing').execute({
      productId: 'p1',
      variantId: 'v2',
      priceCents: 1,
    });
    expect(written).toEqual([]);
    expect(said).toContain('PAR DÉFAUT');
  });

  it('rend le refus du serveur mot pour mot', async () => {
    const { tool } = armTools(detailWith([variant('v1', { isDefault: true })]), undefined, true);
    const said = await tool('pim_variant_set_pricing').execute({
      productId: 'p1',
      variantId: 'v1',
      proPriceHt: '1.123456',
    });
    expect(said).toContain('REFUSÉ');
    expect(said).toContain('400');
    expect(said).toContain('Le prix pro porte six décimales.');
  });
});

describe('pim_set_vat', () => {
  it('fusionne sur la famille : omis gardé, donné écrit', async () => {
    const { tool, written } = armTools(detailWith([variant('v1', { isDefault: true })]));
    await tool('pim_set_vat').execute({ target: 'category', id: 'c1', b2b: 'r2' });
    expect(written).toEqual([
      { route: 'category-vat', body: { takeaway: 'r1', eatIn: 'r3', b2b: 'r2' } },
    ]);
  });

  it('retire une dérogation de fiche sur ""', async () => {
    const { tool, written } = armTools(
      detailWith([variant('v1', { isDefault: true })], {
        vatByContext: { b2b: 'r2', eatIn: 'r3' },
      }),
    );
    await tool('pim_set_vat').execute({ target: 'product', id: 'p1', b2b: '' });
    expect(written).toEqual([{ route: 'product-vat', body: { eatIn: 'r3' } }]);
  });

  it('liste les taux', async () => {
    const { tool } = armTools(null);
    expect(await tool('pim_vat_rates_list').execute({})).toBe('r1 — Réduit — 5.5 %');
  });
});

describe('pim_product_set_media', () => {
  it('accepte une même url en hero et en vignette', async () => {
    const { tool, written } = armTools(null);
    await tool('pim_product_set_media').execute({
      productId: 'p1',
      media: [
        { role: 'hero', url: 'u', name: 'n' },
        { role: 'thumbnail', url: 'u', name: 'n' },
      ],
    });
    expect(written).toHaveLength(1);
  });

  it('refuse deux hero sans rien écrire', async () => {
    const { tool, written } = armTools(null);
    const said = await tool('pim_product_set_media').execute({
      productId: 'p1',
      media: [
        { role: 'hero', url: 'u', name: 'n' },
        { role: 'hero', url: 'v', name: 'm' },
      ],
    });
    expect(written).toEqual([]);
    expect(said).toContain('hero');
  });
});

describe('pim_product_readiness', () => {
  it('nomme chaque manque', async () => {
    const { tool } = armTools(
      detailWith(
        [
          variant('v1', {
            isDefault: true,
            priceCents: null,
            proPriceMillicents: null,
            allergens: null,
          }),
        ],
        { media: [] },
      ),
      [family({})],
    );
    const said = await tool('pim_product_readiness').execute({ productId: 'p1' });
    expect(said).toContain('prix public absent');
    expect(said).toContain('prix pro absent');
    expect(said).toContain('allergènes non déclarés');
    expect(said).toContain('TVA à emporter non réglée');
    expect(said).toContain('TVA B2B non réglée');
    expect(said).toContain('aucune photo');
  });

  // 150 fiches avaient leur seule photo en galerie le 2026-10-17 : elle ne
  // paraissait nulle part, et la fiche passait pour illustrée.
  it('ne compte pas une photo rangée seulement en galerie', async () => {
    const { tool } = armTools(
      detailWith([variant('v1', { isDefault: true })], {
        media: [{ role: 'gallery', url: 'https://x/g.jpg', name: 'g' }],
      }),
      [family({})],
    );
    const said = await tool('pim_product_readiness').execute({ productId: 'p1' });
    expect(said).toContain('aucune photo en ouverture ni en vignette');
  });

  it('suit la déclinaison par défaut et la TVA de la fiche par-dessus sa famille', async () => {
    const { tool } = armTools(
      detailWith(
        [
          variant('v1', { isDefault: true }),
          variant('v2', {
            priceCents: null,
            proPriceMillicents: null,
            allergens: null,
            pricingFollowsDefault: true,
            regulatoryFollowsDefault: true,
          }),
        ],
        { vatByContext: { b2b: 'r2' } },
      ),
      [family({ takeaway: 'r1' })],
    );
    const said = await tool('pim_product_readiness').execute({});
    expect(said).toContain('vendable : rien ne manque');
  });
});

describe('pim_product_publish', () => {
  it('rend le refus du serveur', async () => {
    const { tool } = armTools(null, undefined, true);
    const said = await tool('pim_product_publish').execute({ productId: 'p1' });
    expect(said).toContain('Le prix pro porte six décimales.');
  });
});
