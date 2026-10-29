import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { ProductLineageView } from '@lfd/pim-contracts';
import { describe, expect, it, vi } from 'vitest';

import { CatalogueApi } from '../../catalogue-api';
import { ProductHttpApi } from '../../product-http-api';
import { ReferenceApi } from '../../reference-api';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import type { Variant } from '../../../data/models';
import { ProductFormStore } from '../product-form-store';
import { DEFAULT_CHANGE_SUSPENDED, VariantLifecycle } from '../variant-lifecycle/variant-lifecycle';
import { VariantRetirement } from '../variant-retirement/variant-retirement';

/**
 * **Archiver, détacher, désarchiver une déclinaison**
 * (`plan-gestes-de-declinaison.md`, G1 et G2), et en faire le défaut (G4) : une archivée n'est plus un
 * onglet, elle se liste à part ; les gestes relisent le serveur ; détacher
 * ouvre la nouvelle fiche.
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
const DETACHED = variant({
  id: 'var_4',
  sku: 'CHO-001-4',
  name: { fr: 'Plaque' },
  internalLabel: 'Plaque',
  isDefault: false,
  isDiscontinued: true,
  position: 3,
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

describe('les déclinaisons archivées', () => {
  it('ne sont plus des onglets, et se listent à part', async () => {
    const { store } = await setup();

    expect(store.variantTabs().map((tab) => tab.id)).toEqual(['var_1', 'var_2']);
    expect(store.archivedVariants()).toEqual([
      { id: 'var_3', label: 'Sachet', sku: 'CHO-001-3', detachedTo: null },
    ]);
    expect(store.variantCount()).toBe(2);
  });

  it('une détachée porte le produit qu’elle est devenue', async () => {
    const api = new FakeApi();
    api.variants = [variant(), DETACHED];
    api.lineage = {
      origin: null,
      detachedTo: {
        var_4: { productId: 'prd_neuf', productSku: 'P-NEUF22', productName: { fr: 'Plaque' } },
      },
    };
    const { store } = await setup(api);

    expect(store.archivedVariants()[0]?.detachedTo?.productSku).toBe('P-NEUF22');
  });
});

describe('les gestes', () => {
  it('archiver relit : l’onglet disparaît, et l’écran revient sur le défaut', async () => {
    const { store, api } = await setup();
    store.selectVariant('var_2');

    expect(await store.discontinueVariant('var_2')).toBe(true);

    expect(api.calls[0]).toEqual({ name: 'discontinueVariant', args: ['prd_1', 'var_2'] });
    expect(store.variantTabs().map((tab) => tab.id)).toEqual(['var_1']);
    expect(store.selectedVariantId()).toBe('var_1');
  });

  it('un refus du serveur s’affiche, et rien ne bouge', async () => {
    const { store } = await setup();

    expect(await store.restoreVariant('var_3')).toBe(false);

    expect(store.error()).toContain('P-NEUF22');
    expect(store.archivedVariants()).toHaveLength(1);
  });

  it('détacher rend l’id de la nouvelle fiche', async () => {
    const { store } = await setup();

    expect(await store.detachVariant('var_2')).toBe('prd_neuf');
  });
});

describe('<app-variant-lifecycle>', () => {
  async function render(select: string | null = null, api = new FakeApi()) {
    const { store } = await setup(api);
    if (select !== null) {
      store.selectVariant(select);
    }
    const fixture = TestBed.createComponent(VariantLifecycle);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** Le 2026-10-29, archiver, détacher et désarchiver sont partis dans l'onglet « Danger ». */
  it('ne garde plus aucun geste qui retire, ni la liste des archivées', async () => {
    const host = await render('var_2');

    expect(host.querySelector('fold-danger-zone')).toBeNull();
    expect(host.textContent).not.toContain('Archiver la déclinaison');
    expect(host.textContent).not.toContain('Déclinaisons archivées');
  });

  /**
   * Fermé jusqu'à la bascule de la référence du défaut
   * (`plan-defaut-sous-sa-reference.md`, § 10, D-b) : le geste réussi était
   * éprouvé ici jusqu'au L1, il revient avec le L3.
   */
  it('désactive « en faire le défaut », et dit pourquoi avec la phrase du serveur', async () => {
    const api = new FakeApi();
    const host = await render('var_2', api);
    const calls = api.calls.length;

    const button = buttonNamed(host, 'Faire de cette déclinaison la déclinaison par défaut');
    expect(button.disabled).toBe(true);
    expect(host.querySelector('.make-default')?.textContent).toContain(DEFAULT_CHANGE_SUSPENDED);
    expect(button.getAttribute('aria-describedby')).toBe('make-default-suspended');
    button.click();
    await settle();

    expect(host.querySelector('.make-default fold-inline-confirm')).toBeNull();
    expect(api.calls.length).toBe(calls);
  });
});

describe('<app-variant-retirement>', () => {
  async function render(select: string | null = null, api = new FakeApi()) {
    const { store } = await setup(api);
    if (select !== null) {
      store.selectVariant(select);
    }
    const fixture = TestBed.createComponent(VariantRetirement);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('n’offre aucun geste sur le défaut, mais liste les archivées', async () => {
    const host = await render();

    expect(host.querySelector('fold-danger-zone')).not.toBeNull();
    expect(host.textContent).not.toContain('Archiver la déclinaison');
    expect(host.textContent).toContain('Déclinaisons archivées (1)');
  });

  it('se tait sur le défaut quand rien n’est archivé', async () => {
    const api = new FakeApi();
    api.variants = [variant(), SECOND];
    const host = await render(null, api);

    expect(host.querySelector('fold-danger-zone')).toBeNull();
  });

  it('offre les deux gestes sur une autre déclinaison, en confirmation en ligne', async () => {
    const host = await render('var_2');

    expect(host.textContent).toContain('Archiver la déclinaison');
    expect(host.textContent).toContain('Faire de cette déclinaison un produit');
  });

  it('ouvre la nouvelle fiche après un détachement confirmé', async () => {
    const host = await render('var_2');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    buttonNamed(host, 'Faire de cette déclinaison un produit').click();
    await settle();
    buttonNamed(host, 'Faire un produit').click();
    await settle();

    expect(navigate).toHaveBeenCalledWith(['/pim/produits', 'prd_neuf']);
  });
});

function buttonNamed(host: HTMLElement, label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(
    (button) => button.textContent.trim() === label,
  );
  if (found === undefined) {
    throw new Error(`aucun bouton « ${label} »`);
  }
  return found;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
}
