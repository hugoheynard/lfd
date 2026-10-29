import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type {
  PublishedCatalogView,
  PublishedVariantView,
  SaleReferenceDecisionView,
} from '@lfd/contracts';
import type { ProductLineageView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { CatalogueService } from '../../../../b2b/catalogue/catalogue.service';
import { SaleReferenceDecisionsService } from '../../../../b2b/tarification/sale-reference-decisions.service';
import { CatalogueApi } from '../../catalogue-api';
import { ProductHttpApi } from '../../product-http-api';
import { ReferenceApi } from '../../reference-api';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import type { Variant } from '../../../data/models';
import { ProductFormStore } from '../product-form-store';
import { DetachedDecisions } from '../detached-decisions/detached-decisions';
import { VariantProOffer } from '../variant-pro-offer/variant-pro-offer';

/**
 * **Sous la barre des déclinaisons, ce que le commerce en dit**
 * (`plan-pro-voit-les-declinaisons.md`, L6 et L7 d) : pourquoi une
 * déclinaison montrée n’est pas proposée aux pros, et les décisions tarifaires
 * restées sur l’ancienne référence d’une fiche née d’un détachement.
 */

const EMPTY_NUTRITION = {
  energyKcal: null,
  fatG: null,
  saturatedFatG: null,
  carbsG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
  glycemicIndex: null,
};

function variant(over: Partial<Variant> = {}): Variant {
  return {
    id: 'var_1',
    sku: 'CHO-001-1',
    name: { fr: 'Gros florentin lait' },
    internalLabel: 'Gros florentin lait',
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 250,
    weightGrams: 100,
    proPriceMillicents: null,
    proPricePerKgMillicents: null,
    publicPricePerKgTtcCents: null,
    pricePerKgShownPublic: true,
    pricePerKgShownPro: true,
    saleUnit: 'piece',
    weightMinGrams: null,
    weightStepGrams: null,
    hasBeenPublished: false,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    minQuantities: { pro: null, public: null },
    minQuantityFollowsDefault: false,
    allergens: ['AM'],
    mayContain: [],
    nutrition: EMPTY_NUTRITION,
    ...over,
  };
}

const SECOND = variant({
  id: 'var_2',
  sku: 'CHO-001-2',
  name: { fr: 'Boîte de 220 g' },
  internalLabel: 'Boîte de 220 g',
  isDefault: false,
  position: 1,
});
const ARCHIVED = variant({
  id: 'var_3',
  sku: 'CHO-001-3',
  name: { fr: 'Sachet' },
  internalLabel: 'Sachet',
  isDefault: false,
  isDiscontinued: true,
  position: 2,
});

const NO_LINEAGE: ProductLineageView = { origin: null, detachedTo: {} };

class FakeApi {
  readonly calls: { name: string; args: unknown[] }[] = [];
  variants: readonly Variant[] = [variant(), SECOND, ARCHIVED];
  lineage: ProductLineageView = NO_LINEAGE;

  getDetail() {
    return Promise.resolve({
      product: {
        id: 'prd_1',
        sku: 'CHO-001',
        name: { fr: 'Gros florentin lait' },
        slug: { fr: 'gros-florentin-lait' },
        kind: 'daily',
        categoryId: 'cat_1',
        status: 'draft',
        variants: this.variants,
        variantsAsTiles: true,
        vatByContext: {},
      },
      editorial: {
        descriptionShort: null,
        descriptionLong: null,
        story: null,
        pairing: null,
        brand: '',
        seoTitle: null,
        seoDescription: null,
      },
      allergens: ['AM'],
      mayContain: [],
      nutrition: EMPTY_NUTRITION,
      media: [],
      readiness: null,
      readinessStale: false,
      lineage: this.lineage,
    });
  }
  discontinueVariant(...args: unknown[]) {
    this.calls.push({ name: 'discontinueVariant', args });
    this.variants = this.variants.map((entry) =>
      entry.id === args[1] ? { ...entry, isDiscontinued: true } : entry,
    );
    return Promise.resolve();
  }
  restoreVariant(...args: unknown[]) {
    this.calls.push({ name: 'restoreVariant', args });
    return Promise.reject(
      new HttpErrorResponse({
        status: 409,
        error: { message: 'La déclinaison est devenue le produit « P-NEUF22 ».' },
      }),
    );
  }
  makeVariantDefault(...args: unknown[]) {
    this.calls.push({ name: 'makeVariantDefault', args });
    this.variants = this.variants.map((entry) => ({ ...entry, isDefault: entry.id === args[1] }));
    return Promise.resolve();
  }
  detachVariant(...args: unknown[]) {
    this.calls.push({ name: 'detachVariant', args });
    return Promise.resolve('prd_neuf');
  }
  citedAllergens() {
    return Promise.resolve([]);
  }
}

async function setup(api = new FakeApi()) {
  TestBed.configureTestingModule({
    providers: [
      ProductFormStore,
      provideHttpClient(),
      provideRouter([]),
      provideTestSalesContexts(),
      { provide: ProductHttpApi, useValue: api },
      {
        provide: CatalogueApi,
        useValue: {
          listCategories: () => Promise.resolve([]),
          listVatRates: () => Promise.resolve([]),
        },
      },
      { provide: ReferenceApi, useValue: { allergens: () => Promise.resolve({ entries: [] }) } },
    ],
  });
  const store = TestBed.inject(ProductFormStore);
  await store.init('prd_1');
  return { store, api };
}

function published(part: Partial<PublishedVariantView>): PublishedCatalogView {
  const base: PublishedVariantView = {
    sku: 'CHO-001-1',
    name: 'Gros florentin lait',
    onSale: true,
    isDefault: true,
    gaps: [],
    reviewPending: { pro: false, public: false },
    pro: { state: 'en_vente', htMillicents: 1_000_000 },
    public: { state: 'en_vente', ttcCents: 250 },
  };
  return {
    shelves: [],
    pendingReview: [],
    entries: [
      {
        productId: 'prd_1',
        productSku: 'CHO-001',
        name: 'Gros florentin lait',
        categoryId: 'cat_1',
        status: 'active',
        audience: 'both',
        audienceInherited: true,
        familyAudience: 'both',
        variants: [base, { ...base, sku: 'CHO-001-2', isDefault: false, ...part }],
        receivedAt: '2026-10-29T08:00:00.000Z',
      },
    ],
  };
}

class StubCatalogue {
  constructor(private readonly view: PublishedCatalogView | null) {}
  published(): Promise<PublishedCatalogView> {
    return this.view === null
      ? Promise.reject(new HttpErrorResponse({ status: 403 }))
      : Promise.resolve(this.view);
  }
}

class StubDecisions {
  readonly asked: string[] = [];
  constructor(private readonly views: readonly SaleReferenceDecisionView[]) {}
  standingOn(sku: string): Promise<readonly SaleReferenceDecisionView[]> {
    this.asked.push(sku);
    return Promise.resolve(this.views);
  }
}

async function render<T>(
  component: Type<T>,
  options: {
    readonly catalogue?: StubCatalogue;
    readonly decisions?: StubDecisions;
    readonly api?: FakeApi;
  },
): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      { provide: CatalogueService, useValue: options.catalogue ?? new StubCatalogue(null) },
      {
        provide: SaleReferenceDecisionsService,
        useValue: options.decisions ?? new StubDecisions([]),
      },
    ],
  });
  await setup(options.api ?? new FakeApi());
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('<app-variant-pro-offer>', () => {
  it('dit « pas de prix pro » pour la déclinaison montrée que le canal pro ne sert pas', async () => {
    const host = await render(VariantProOffer, {
      catalogue: new StubCatalogue(published({ pro: { state: 'incomplet', htMillicents: null } })),
    });

    expect(host.textContent).toContain('Non proposée aux pros');
    expect(host.textContent).toContain('(CHO-001-2) — pas de prix pro');
    expect(host.textContent).not.toContain('CHO-001-1');
  });

  it('renvoie au Catalogue publié une validation pro en attente', async () => {
    const host = await render(VariantProOffer, {
      catalogue: new StubCatalogue(
        published({ pro: { state: 'en_attente_validation', htMillicents: 1 } }),
      ),
    });

    expect(host.textContent).toContain('validation pro en attente');
    expect(host.querySelector('fold-link')?.textContent).toContain('Catalogue publié');
  });

  it('se tait quand tout est proposé aux pros', async () => {
    const host = await render(VariantProOffer, { catalogue: new StubCatalogue(published({})) });

    expect(host.querySelector('fold-callout')).toBeNull();
  });

  it('dit qu’il ne sait pas, plutôt que de se taire, quand la lecture échoue', async () => {
    const host = await render(VariantProOffer, { catalogue: new StubCatalogue(null) });

    expect(host.textContent).toContain('n’a pas pu être lu');
  });
});

describe('<app-detached-decisions>', () => {
  const ORIGIN: ProductLineageView = {
    origin: {
      productId: 'prd_0',
      productSku: 'CHO-000',
      productName: { fr: 'Florentins' },
      variantSku: 'CHO-000-2',
      variantName: { fr: 'Boîte' },
    },
    detachedTo: {},
  };

  it('liste les décisions restées sur l’ancienne référence', async () => {
    const api = new FakeApi();
    api.lineage = ORIGIN;
    const decisions = new StubDecisions([
      {
        kind: 'mercuriale',
        id: 'mer_1',
        label: 'Mercuriale Hôtel',
        companyId: 'cmp_1',
        companyName: 'Hôtel du Col',
        validFrom: null,
        validTo: null,
        paused: false,
      },
    ]);

    const host = await render(DetachedDecisions, { api, decisions });

    expect(decisions.asked).toEqual(['CHO-000-2']);
    expect(host.textContent).toContain('ancienne référence CHO-000-2');
    expect(host.textContent).toContain('Mercuriale « Mercuriale Hôtel » — Hôtel du Col');
  });

  it('ne demande rien sur une fiche qui n’est pas née d’un détachement', async () => {
    const decisions = new StubDecisions([]);

    const host = await render(DetachedDecisions, { decisions });

    expect(decisions.asked).toEqual([]);
    expect(host.querySelector('fold-callout')).toBeNull();
  });
});
