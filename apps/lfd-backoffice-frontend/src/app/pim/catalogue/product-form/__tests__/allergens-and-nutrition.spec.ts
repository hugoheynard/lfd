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
 * 🔴 **Les deux moitiés de la fiche, et ce que chacune n'envoie PAS.**
 *
 * Trois régressions tiennent ici, toutes de la même famille — une écriture qui
 * détruit ce qu'elle ne visait pas :
 *
 * - **0a** : enregistrer la fiche effaçait les traces « peut contenir ». La
 *   requête remplaçait la déclaration ENTIÈRE et l'écran ne renvoyait pas ce
 *   qu'il ne montrait pas. Les traces sont maintenant DANS la section
 *   allergènes : aucune écriture de nutrition ne peut plus les atteindre.
 * - **0c** : enregistrer sans rien cocher affirmait « aucun allergène ».
 * - Le 400 muet : la route nutrition REFUSE un corps qui porte des codes
 *   d'allergène. L'écran déployé envoyait encore l'ancien format.
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
    nutritionFollowsDefault: false,
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
  saveVariantAllergens(...args: unknown[]) {
    this.calls.push({ name: 'saveVariantAllergens', args });
    return Promise.resolve();
  }
  saveVariantNutrition(...args: unknown[]) {
    this.calls.push({ name: 'saveVariantNutrition', args });
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

/** La charge utile du dernier enregistrement d'allergènes. */
function lastDeclaration(api: FakeApi): { allergens?: unknown; mayContain?: unknown } {
  const call = [...api.calls].reverse().find((entry) => entry.name === 'saveVariantAllergens');
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

    await store.saveOne('allergenes');

    expect(store.error()).toContain('Déclarez les allergènes');
    expect(api.calls.some((call) => call.name === 'saveVariantAllergens')).toBe(false);
  });

  it('laisse passer « aucun allergène » quand c’est COCHÉ', async () => {
    const api = new FakeApi();
    api.variants = [variant({ allergens: null, mayContain: [] })];
    const { store } = await setup(api);

    store.declareNoAllergen(true);
    await store.saveOne('allergenes');

    expect(store.error()).toBeNull();
    expect(lastDeclaration(api).allergens).toEqual([]);
  });
});

describe('les traces « peut contenir » sont des ALLERGÈNES', () => {
  it('les charge depuis la déclinaison', async () => {
    const { store } = await setup();

    expect(store.mayContain()).toEqual(TRACES);
  });

  /**
   * 🔴 Le cas qui échouait. La charge utile ne portait que `allergens` et
   * `nutrition` ; le serveur en déduisait « aucune trace » et les effaçait.
   */
  it('les envoie avec la section allergènes', async () => {
    const { store, api } = await setup();

    await store.saveOne('allergenes');

    expect(lastDeclaration(api).mayContain).toEqual(TRACES);
  });

  it('ne les confond pas avec les allergènes déclarés', async () => {
    const { store, api } = await setup();

    await store.saveOne('allergenes');

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

    await store.saveOne('allergenes');

    expect(lastDeclaration(api).mayContain).toEqual([]);
  });
});

describe('enregistrer une moitié n’envoie RIEN de l’autre', () => {
  /**
   * 🔴 Le bug 0a, rendu inatteignable. Les traces ne voyagent plus avec la
   * nutrition : la route les REFUSE (400), et l'écran ne les lui propose plus.
   */
  it('la nutrition ne porte aucun code d’allergène', async () => {
    const { store, api } = await setup();

    store.setNutrition('energyKcal', 310);
    await store.saveOne('nutrition');

    const call = api.calls.find((entry) => entry.name === 'saveVariantNutrition');
    expect(call).toBeDefined();
    expect(JSON.stringify(call?.args)).not.toContain('mayContain');
    expect(JSON.stringify(call?.args)).not.toContain('allergens');
    expect(api.calls.map((entry) => entry.name)).not.toContain('saveVariantAllergens');
  });

  /**
   * Et la réciproque : la section allergènes n'envoie pas une calorie. Une
   * valeur tapée d'un côté ne doit pas partir par l'autre route, sans quoi
   * « deux enregistrements » n'en ferait qu'un déguisé.
   */
  it('les allergènes ne portent aucune valeur nutritionnelle', async () => {
    const { store, api } = await setup();

    store.setNutrition('energyKcal', 310);
    await store.saveOne('allergenes');

    expect(JSON.stringify(lastDeclaration(api))).not.toContain('310');
    expect(api.calls.map((entry) => entry.name)).not.toContain('saveVariantNutrition');
  });

  /**
   * 🔴 D2. Le règlement exige les allergènes, pas les valeurs nutritionnelles :
   * une fiche dont personne n'a déclaré les allergènes enregistre quand même sa
   * nutrition. Le refus de la section allergènes ne déborde pas sur l'autre.
   */
  it('la nutrition s’enregistre même sans déclaration d’allergène', async () => {
    const api = new FakeApi();
    api.variants = [variant({ allergens: null, mayContain: [] })];
    const { store } = await setup(api);

    store.setNutrition('saltG', 1.2);
    await store.saveOne('nutrition');

    expect(store.error()).toBeNull();
    expect(api.calls.map((entry) => entry.name)).toContain('saveVariantNutrition');
  });
});

describe('le tri-état ne peut pas se contredire', () => {
  /**
   * 🔴 Bug 0c vu de l'écran : `declaresNone` vivait À CÔTÉ de la liste, et à
   * l'enregistrement le booléen gagnait en jetant la liste. Il n'y a plus qu'un
   * champ — la contradiction n'est pas détectée, elle est inexprimable.
   */
  it('cocher « aucun allergène » vide la liste, et la décocher ne l’affirme pas', async () => {
    const { store } = await setup();

    store.declareNoAllergen(true);
    expect(store.selected()).toEqual([]);
    expect(store.declaresNone()).toBe(true);

    store.declareNoAllergen(false);
    expect(store.declaresNone()).toBe(false);
    expect(store.declaration().allergens).toBeNull();
  });

  /**
   * Décocher la DERNIÈRE case n'affirme rien : la section refuse alors de
   * partir, au lieu d'envoyer le `[]` que personne n'a coché.
   */
  it('décocher le dernier allergène retombe au silence, pas sur l’affirmation', async () => {
    const { store, api } = await setup();

    store.toggleAllergen('AM', false);

    expect(store.declaresNone()).toBe(false);
    await store.saveOne('allergenes');
    expect(store.error()).toContain('Déclarez les allergènes');
    expect(api.calls.some((call) => call.name === 'saveVariantAllergens')).toBe(false);
  });

  /**
   * Présent et « peut contenir » sont exclusifs — le serveur refuse le
   * chevauchement. Déclarer une trace sur un code présent le retire de la
   * présence, plutôt que de partir chercher un 400.
   */
  it('un code ne peut pas être présent ET en trace', async () => {
    const { store } = await setup();

    store.setTraces(['AM']);

    expect(store.mayContain()).toEqual(['AM']);
    expect(store.selected()).not.toContain('AM');
  });

  /** Et dans l'autre sens : cocher une présence retire la trace. */
  it('cocher un code déclaré en trace le fait quitter les traces', async () => {
    const { store } = await setup();

    store.toggleAllergen('AN', true);

    expect(store.mayContain()).toEqual([]);
    expect(store.selected()).toContain('AN');
  });

  /** « Aucun allergène » + une trace d'atelier : les deux tiennent ensemble. */
  it('garde les traces sous « aucun allergène »', async () => {
    const { store, api } = await setup();

    store.declareNoAllergen(true);
    await store.saveOne('allergenes');

    expect(lastDeclaration(api)).toEqual({ allergens: [], mayContain: ['AN'] });
  });
});
