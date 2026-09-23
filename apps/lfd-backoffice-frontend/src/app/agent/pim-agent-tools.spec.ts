import { Injector, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CategoryStore } from '../pim/catalogue/category-store';
import { ProductHttpApi, type ProductDetail } from '../pim/catalogue/product-http-api';
import {
  type Category,
  EMPTY_NUTRITION,
  type NutritionValues,
  type Variant,
} from '../pim/data/models';

import { declarePimAgentTools } from './pim-agent-tools';

/** Ce qu'un outil enregistré sait faire, vu du test. */
interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: Record<string, string | number>) => Promise<string>;
}

/** Une écriture de nutrition partie vers le serveur. */
interface NutritionCall {
  readonly productId: string;
  readonly variantId: string;
  readonly values: NutritionValues;
}

const DEFAULT_NUTRITION: NutritionValues = { ...EMPTY_NUTRITION, energyKcal: 400, saltG: 1.2 };

function variant(id: string, overrides: Partial<Variant>): Variant {
  return {
    id,
    sku: `SKU-${id}`,
    name: { fr: id },
    isDefault: false,
    isDiscontinued: false,
    position: 1,
    priceCents: null,
    weightGrams: null,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergens: null,
    mayContain: [],
    nutrition: EMPTY_NUTRITION,
    ...overrides,
  };
}

function detailWith(variants: readonly Variant[]): ProductDetail {
  return {
    product: {
      id: 'p1',
      sku: 'SKU-P1',
      name: { fr: 'Brioche' },
      kind: 'daily',
      categoryId: 'c1',
      status: 'draft',
      variants: [...variants],
      channelsOverride: null,
      vatByContext: {},
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
    nutrition: DEFAULT_NUTRITION,
    media: [],
    readiness: null,
    readinessStale: false,
  };
}

/**
 * Déclare la trousse devant une passerelle WebMCP doublée, et rend les outils
 * enregistrés plus les écritures parties.
 *
 * La passerelle est posée sur `document` par `Object.defineProperty` :
 * `modelContext` n'existe pas dans la bibliothèque DOM de TypeScript, et le
 * dépôt refuse les casts.
 */
function armTools(detail: ProductDetail | null) {
  const registered: RegisteredTool[] = [];
  const written: NutritionCall[] = [];

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

  const products: Pick<ProductHttpApi, 'getDetail' | 'saveVariantNutrition'> = {
    getDetail: () => Promise.resolve(detail),
    saveVariantNutrition: (productId, variantId, values) => {
      written.push({ productId, variantId, values });
      return Promise.resolve();
    },
  };
  // `items` est un SIGNAL, pas une fonction : un doublé qui rend `() => []`
  // compile sous vitest et échoue au typecheck des specs — lequel ne rougit
  // nulle part au moment d'exécuter les tests.
  const categories: Pick<CategoryStore, 'reload' | 'items'> = {
    reload: () => Promise.resolve(),
    items: signal<Category[]>([]),
  };

  TestBed.configureTestingModule({
    providers: [
      { provide: ProductHttpApi, useValue: products },
      { provide: CategoryStore, useValue: categories },
    ],
  });
  const injector = TestBed.inject(Injector);
  runInInjectionContext(injector, () => declarePimAgentTools());

  const nutritionTool = registered.find((tool) => tool.name === 'pim_variant_set_nutrition');
  if (nutritionTool === undefined) {
    throw new Error("L'outil de nutrition n'a pas été enregistré.");
  }
  return { nutritionTool, written };
}

afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
});

beforeEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
});

describe('pim_variant_set_nutrition', () => {
  it("REFUSE une déclinaison alignée au lieu d'y graver les valeurs du défaut", async () => {
    // Régression : l'outil reportait `target.nutrition` pour les valeurs qu'on
    // ne lui donne pas. Ce champ est RÉSOLU côté serveur — sur une déclinaison
    // alignée il porte celles du DÉFAUT — donc l'outil les écrivait dans les
    // colonnes propres de la déclinaison visée. Muette : le serveur compare
    // l'avant et l'après sur le résolu, les trouve identiques, et journalise
    // « sans modification » (2026-09-23).
    const aligned = variant('v2', {
      nutritionFollowsDefault: true,
      nutrition: DEFAULT_NUTRITION,
    });
    const { nutritionTool, written } = armTools(
      detailWith([variant('v1', { isDefault: true, position: 0 }), aligned]),
    );

    const said = await nutritionTool.execute({
      productId: 'p1',
      variantId: 'v2',
      energyKcal: 250,
    });

    expect(written).toEqual([]);
    expect(said).toContain('suit les valeurs nutritionnelles');
    // Le refus NOMME les deux sorties, pour un agent sans le code sous les yeux.
    expect(said).toContain('PAR DÉFAUT');
    expect(said).toContain('suit les valeurs du défaut');
  });

  it("écrit, et reporte ce qu'on ne lui donne pas, sur une déclinaison NON alignée", async () => {
    const own = variant('v2', {
      nutrition: { ...EMPTY_NUTRITION, energyKcal: 100, saltG: 0.5 },
    });
    const { nutritionTool, written } = armTools(
      detailWith([variant('v1', { isDefault: true, position: 0 }), own]),
    );

    await nutritionTool.execute({ productId: 'p1', variantId: 'v2', energyKcal: 250 });

    expect(written).toHaveLength(1);
    expect(written[0]?.variantId).toBe('v2');
    expect(written[0]?.values.energyKcal).toBe(250);
    // Le report : `saltG` n'était pas dans les arguments, il survit.
    expect(written[0]?.values.saltG).toBe(0.5);
  });
});
