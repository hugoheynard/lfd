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
 * 🔴 **Régression réglementaire : enregistrer la fiche EFFAÇAIT les traces.**
 *
 * L'écran n'a aucune interface pour « peut contenir ». Sa charge utile ne
 * portait donc jamais `mayContain`, et le serveur lit une absence comme un
 * effacement (`declaration-support.ts` : `input.mayContain ?? []`), parce que la
 * route remplace la déclaration ENTIÈRE.
 *
 * Conséquence en production : chaque enregistrement de la section depuis le
 * back-office effaçait les traces posées par le semis ou par un outil agent —
 * sur une donnée qui s'imprime sur une étiquette (trouvé le 2026-09-22).
 *
 * Ces cas tiennent le transport. Ils ne disent RIEN de la saisie : tant que
 * l'écran ne montre pas les traces, elles ne font que passer.
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

/** « Peut contenir des fruits à coque » — le cas qui coûte cher s'il disparaît. */
const TRACES = ['AN'];

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
    mayContain: [...TRACES],
    nutrition: EMPTY_NUTRITION,
    ...over,
  };
}

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

class FakeApi {
  readonly calls: Call[] = [];
  variants: readonly Variant[] = [variant()];

  getDetail() {
    const [first] = this.variants;
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
      allergens: first?.allergens ?? null,
      mayContain: [...(first?.mayContain ?? [])],
      nutrition: EMPTY_NUTRITION,
      media: [],
      readiness: null,
      readinessStale: false,
    });
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

async function setup(api = new FakeApi()): Promise<{ store: ProductFormStore; api: FakeApi }> {
  TestBed.configureTestingModule({
    providers: [
      ProductFormStore,
      provideHttpClient(),
      provideTestSalesContexts(),
      { provide: ProductHttpApi, useValue: api },
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

/** La charge utile du dernier `saveNutrition`, quelle qu'en soit la forme. */
function lastDeclaration(api: FakeApi): { allergens?: unknown; mayContain?: unknown } {
  const call = [...api.calls].reverse().find((entry) => entry.name === 'saveNutrition');
  if (call === undefined) {
    throw new Error("La section n'a pas été enregistrée.");
  }
  const payload = call.args[2];
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Charge utile inattendue.');
  }
  return payload;
}

describe('enregistrer sans rien déclarer n’affirme pas « aucun allergène »', () => {
  /**
   * 🔴 Régression. `[]` est une AFFIRMATION positive, et l'écran l'envoyait dès
   * qu'on enregistrait la section sans rien cocher : taper une calorie sur une
   * fiche vierge déclarait qu'elle ne contient aucun allergène — et l'invariant
   * 7 la rendait publiable.
   *
   * La création portait la garde (`declares`) ; la section l'avait perdue, à
   * dix lignes de là.
   */
  it('refuse, et dit le geste qui manque', async () => {
    const api = new FakeApi();
    api.variants = [variant({ allergens: null, mayContain: [] })];
    const { store } = await setup(api);

    await store.saveOne('fiche');

    expect(store.error()).toContain('Déclarez les allergènes');
    expect(api.calls.some((call) => call.name === 'saveNutrition')).toBe(false);
  });

  it('laisse passer « aucun allergène » quand c’est COCHÉ', async () => {
    const api = new FakeApi();
    api.variants = [variant({ allergens: null, mayContain: [] })];
    const { store } = await setup(api);

    store.declareNoAllergen(true);
    await store.saveOne('fiche');

    expect(store.error()).toBeNull();
    expect(lastDeclaration(api).allergens).toEqual([]);
  });
});

describe('les traces « peut contenir » survivent à un enregistrement', () => {
  it('les charge depuis la déclinaison', async () => {
    const { store } = await setup();

    expect(store.mayContain()).toEqual(TRACES);
  });

  /**
   * 🔴 Le cas qui échouait. La charge utile ne portait que `allergens` et
   * `nutrition` ; le serveur en déduisait « aucune trace » et les effaçait.
   */
  it('les renvoie telles quelles quand on enregistre la section', async () => {
    const { store, api } = await setup();

    await store.saveOne('fiche');

    expect(lastDeclaration(api).mayContain).toEqual(TRACES);
  });

  it('ne les confond pas avec les allergènes déclarés', async () => {
    const { store, api } = await setup();

    await store.saveOne('fiche');

    const declaration = lastDeclaration(api);
    expect(declaration.allergens).not.toContain('AN');
    expect(declaration.mayContain).toEqual(TRACES);
  });

  /**
   * Une fiche sans trace en envoie un tableau vide, et c'est juste : ici
   * l'absence de trace est un fait lu sur la fiche, pas une omission de
   * l'écran. C'est la distinction que le défaut d'origine écrasait.
   */
  it('une fiche sans trace en envoie un tableau vide', async () => {
    const api = new FakeApi();
    api.variants = [variant({ mayContain: [] })];
    const { store } = await setup(api);

    await store.saveOne('fiche');

    expect(lastDeclaration(api).mayContain).toEqual([]);
  });
});
