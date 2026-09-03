import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CatalogueApi } from '../../catalogue-api';
import { ProductHttpApi } from '../../product-http-api';
import { ReferenceApi } from '../../reference-api';
import { provideTestSalesContexts } from '../../../sales-contexts/sales-context-store.testing';
import type { Variant } from '../../../data/models';
import { ProductFormStore } from '../product-form-store';

/**
 * Ce que ces cas tiennent : **basculer d'un article à l'autre ne perd rien**.
 *
 * La page n'éditait qu'une déclinaison — celle par défaut, aplatie dans le
 * produit comme si le prix et les allergènes lui appartenaient. Dès qu'il y en a
 * deux, la bascule devient un geste courant, et un geste courant qui jette une
 * saisie sans un mot est le pire des défauts : on ne le découvre qu'après.
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
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: 250,
    weightGrams: 100,
    regulatoryFollowsDefault: false,
    pricingFollowsDefault: false,
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
  isDefault: false,
  position: 1,
  priceCents: null,
  weightGrams: 220,
  regulatoryFollowsDefault: true,
});

class FakeApi {
  readonly calls: { name: string; args: unknown[] }[] = [];
  variants: readonly Variant[] = [variant(), SECOND];

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
        channelsOverride: null,
        priceEur: 2.5,
        weightGrams: 100,
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
    });
  }

  addVariant(...args: unknown[]) {
    this.calls.push({ name: 'addVariant', args });
    return Promise.resolve('var_3');
  }
  alignVariant(...args: unknown[]) {
    this.calls.push({ name: 'alignVariant', args });
    return Promise.resolve();
  }
  saveNutrition(...args: unknown[]) {
    this.calls.push({ name: 'saveNutrition', args });
    return Promise.resolve();
  }
  savePricing(...args: unknown[]) {
    this.calls.push({ name: 'savePricing', args });
    return Promise.resolve();
  }
  saveVat() {
    return Promise.resolve();
  }
  saveChannels() {
    return Promise.resolve();
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
      provideTestSalesContexts(),
      { provide: ProductHttpApi, useValue: api },
      // Le magasin charge aussi familles, taux et référentiel d'allergènes :
      // sans ces doublures, `init` tombe et rien n'est hydraté.
      {
        provide: CatalogueApi,
        useValue: {
          listCategories: () =>
            Promise.resolve([
              {
                id: 'cat_1',
                name: { fr: 'Chocolat' },
                slug: { fr: 'chocolat' },
                parentId: null,
                position: 1,
                isArchived: false,
                channelPreset: [],
                vatByContext: {},
                activeProductCount: 1,
              },
            ]),
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

describe('la barre des déclinaisons', () => {
  it('nomme le défaut, puis les rangs — jamais un identifiant', async () => {
    const { store } = await setup();

    expect(store.variantTabs().map((tab) => tab.label)).toEqual(['Défaut', 'Déclinaison 2']);
    expect(store.variantTabs()[0]?.selected).toBe(true);
  });

  it('ouvre le défaut à l’arrivée', async () => {
    const { store } = await setup();

    expect(store.selectedVariantId()).toBe('var_1');
    expect(store.editingDefault()).toBe(true);
  });
});

describe('basculer ne perd rien', () => {
  it('rend la saisie laissée sur l’autre déclinaison', async () => {
    const { store } = await setup();

    store.priceEur.set(9.9);
    store.selectVariant('var_2');
    expect(store.priceEur()).toBeNull();

    store.selectVariant('var_1');

    expect(store.priceEur()).toBe(9.9);
  });

  it('charge ce que porte la déclinaison ouverte', async () => {
    const { store } = await setup();

    store.selectVariant('var_2');

    expect(store.weightGrams()).toBe(220);
    expect(store.regulatoryAligned()).toBe(true);
  });

  /**
   * 🔴 Sans cette reprise, changer d'onglet ferait apparaître le bouton
   * « Enregistrer » sur une section qu'on vient seulement d'AFFICHER — et le
   * clic écrirait sur l'autre article ce que personne n'avait tapé.
   */
  it('ne déclare pas modifiée une section qu’on vient d’ouvrir', async () => {
    const { store } = await setup();

    store.selectVariant('var_2');

    expect(store.isDirty('tarif')).toBe(false);
    expect(store.isDirty('fiche')).toBe(false);
  });
});

describe('les cartes portées par la fiche se verrouillent', () => {
  it('ne verrouille rien sur le défaut', async () => {
    const { store } = await setup();

    expect(store.lockedSections().size).toBe(0);
  });

  it('verrouille identité, communication et visuels sur une autre déclinaison', async () => {
    const { store } = await setup();

    store.selectVariant('var_2');

    expect([...store.lockedSections()].sort()).toEqual(['communication', 'identite', 'visuels']);
  });
});

describe('la ligne sous l’en-tête de chaque carte', () => {
  /**
   * La MÊME ligne au même endroit sur toutes les cartes : c'est ce qui la rend
   * lisible. Une case au milieu d'une carte et absente des autres oblige à
   * chercher, section par section, s'il y a quelque chose à savoir.
   */
  it('n’a rien à dire sur la déclinaison par défaut', async () => {
    const { store } = await setup();

    expect([...store.alignments().values()].map((row) => row.kind)).toEqual([
      'none',
      'none',
      'none',
      'none',
      'none',
    ]);
  });

  it('offre une case au tarif et à la fiche, une mention aux autres', async () => {
    const { store } = await setup();

    store.selectVariant('var_2');

    const rows = store.alignments();
    expect(rows.get('tarif')).toMatchObject({ kind: 'alignable', aspect: 'pricing' });
    expect(rows.get('fiche')).toMatchObject({ kind: 'alignable', aspect: 'regulatory' });
    expect(rows.get('identite')?.kind).toBe('product');
    expect(rows.get('communication')?.kind).toBe('product');
    expect(rows.get('visuels')?.kind).toBe('product');
  });

  it('bascule la bonne section, et LAISSE l’autre où elle était', async () => {
    const { store } = await setup();
    store.selectVariant('var_2');
    // On part d'un état où les deux DIFFÈRENT : sinon « l'autre n'a pas bougé »
    // se vérifierait tout seul, et le cas ne prouverait rien.
    store.setAlignment('fiche', false);

    store.setAlignment('tarif', true);

    expect(store.pricingAligned()).toBe(true);
    expect(store.regulatoryAligned()).toBe(false);
  });
});

describe('le tarif hérité ne s’écrit pas', () => {
  /**
   * 🔴 Écrire un prix pendant qu'il est hérité poserait un montant propre que
   * personne n'a saisi, et détacherait la déclinaison sans qu'on l'ait demandé.
   */
  it('n’envoie AUCUN prix tant que la case est cochée', async () => {
    const { store, api } = await setup();
    store.selectVariant('var_2');
    store.setAlignment('tarif', true);

    await store.saveOne('tarif');

    expect(api.calls.map((call) => call.name)).toContain('alignVariant');
    expect(api.calls.map((call) => call.name)).not.toContain('savePricing');
  });

  it('tarifie pour de bon dès qu’on la décoche', async () => {
    const { store, api } = await setup();
    store.selectVariant('var_2');
    store.setAlignment('tarif', false);
    store.priceEur.set(4.2);

    await store.saveOne('tarif');

    expect(api.calls.map((call) => call.name)).toContain('savePricing');
  });
});

describe('la case « aligner sur le défaut »', () => {
  it('n’envoie AUCUNE déclaration tant qu’elle est cochée', async () => {
    const { store, api } = await setup();
    store.selectVariant('var_2');

    await store.saveOne('fiche');

    expect(api.calls.map((call) => call.name)).toContain('alignVariant');
    expect(api.calls.map((call) => call.name)).not.toContain('saveNutrition');
  });

  it('déclare pour de bon dès qu’on la décoche', async () => {
    const { store, api } = await setup();
    store.selectVariant('var_2');
    store.regulatoryAligned.set(false);

    await store.saveOne('fiche');

    expect(api.calls.filter((call) => call.name === 'alignVariant')[0]?.args).toEqual([
      'prd_1',
      'var_2',
      'regulatory',
      false,
    ]);
    expect(api.calls.map((call) => call.name)).toContain('saveNutrition');
  });

  /** Cocher est une modification : sinon la case bascule et rien ne s'enregistre. */
  it('rend la section modifiée', async () => {
    const { store } = await setup();
    store.selectVariant('var_2');

    store.regulatoryAligned.set(false);

    expect(store.isDirty('fiche')).toBe(true);
  });
});
