import { provideHttpClient, type HttpRequest } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  AppellationView,
  IngredientView,
  ProductIngredientAllergensView,
} from '@lfd/pim-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { API_BASE_URL } from '../pim/data/api';

import { D5_NOTICE, SHOWN_INGREDIENTS } from './ingredient-agent-text';
import {
  INGREDIENT_READ_TOOLS,
  INGREDIENT_WRITE_TOOLS,
  declareIngredientAgentTools,
  reordered,
} from './ingredient-agent-tools';

type ToolArgs = Record<string, unknown>;

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: ToolArgs) => Promise<string>;
}

const AOP: AppellationView = {
  code: 'beurre-savoie',
  label: { fr: 'Beurre de Savoie' },
  scheme: 'AOP',
  active: true,
  usedBy: 1,
};

function ingredient(key: string, overrides: Partial<IngredientView> = {}): IngredientView {
  return {
    key,
    name: { fr: key },
    description: null,
    origin: 'Savoie, France',
    appellation: null,
    allergens: [],
    usedBy: 0,
    ...overrides,
  };
}

/** L'état servi par le faux serveur, et ce qu'il a reçu. */
interface Server {
  ingredients: IngredientView[];
  cited: string[];
  readonly calls: string[];
  readonly bodies: unknown[];
}

const CITED_VIEW: ProductIngredientAllergensView = {
  productId: 'p1',
  citedByIngredients: ['GLU', 'MLK'],
  variants: [
    { variantId: 'v1', declaredAllergens: ['GLU'], citedNotDeclared: ['MLK'] },
    { variantId: 'v2', declaredAllergens: null, citedNotDeclared: [] },
  ],
};

function respond(server: Server, request: HttpRequest<unknown>): object {
  const path = request.url.replace('/pim/', '');
  if (request.method !== 'GET') {
    server.bodies.push(request.body);
  }
  if (request.method === 'GET' && path === 'ingredients') {
    return server.ingredients;
  }
  if (request.method === 'GET' && path === 'appellations') {
    return [AOP];
  }
  if (request.method === 'GET' && path === 'products/p1/ingredients') {
    return server.cited.map(
      (key) => server.ingredients.find((row) => row.key === key) ?? ingredient(key),
    );
  }
  if (request.method === 'GET' && path === 'products/p1/ingredient-allergens') {
    return CITED_VIEW;
  }
  if (request.method === 'PUT' && path === 'products/p1/ingredients') {
    const body = request.body;
    if (typeof body === 'object' && body !== null && 'keys' in body && Array.isArray(body.keys)) {
      server.cited = body.keys.map(String);
    }
  }
  return {};
}

function armTools(canWrite = true, ingredients: IngredientView[] = []) {
  const registered = new Map<string, RegisteredTool>();
  Object.defineProperty(document, 'modelContext', {
    configurable: true,
    writable: true,
    value: {
      registerTool: (tool: RegisteredTool): Promise<void> => {
        registered.set(tool.name, tool);
        return Promise.resolve();
      },
    },
  });
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: '/pim' },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const server: Server = { ingredients, cited: ['farine', 'beurre'], calls: [], bodies: [] };
  const names = runInInjectionContext(TestBed.inject(Injector), () =>
    declareIngredientAgentTools(canWrite),
  );

  /** Appelle l'outil et sert chaque requête qu'il émet, jusqu'à sa réponse. */
  async function call(name: string, args: ToolArgs = {}): Promise<string> {
    const tool = registered.get(name);
    if (tool === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    let done = false;
    const pending = tool.execute(args).finally(() => {
      done = true;
    });
    while (!done) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      for (const request of http.match(() => true)) {
        server.calls.push(`${request.request.method} ${request.request.url}`);
        request.flush(respond(server, request.request));
      }
    }
    return pending;
  }
  return { names, registered, server, call };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => Reflect.deleteProperty(document, 'modelContext'));

const FARINE = ingredient('farine', { allergens: ['GLU'], usedBy: 3 });
const BEURRE = ingredient('beurre', { appellation: AOP, allergens: ['MLK'], usedBy: 1 });
const SUCRE = ingredient('sucre');

describe('declareIngredientAgentTools — déclaration', () => {
  it('rend les noms qu’il enregistre, tous préfixés `ingredient_`', () => {
    const { names, registered } = armTools();
    expect(names).toEqual([...INGREDIENT_READ_TOOLS, ...INGREDIENT_WRITE_TOOLS]);
    expect([...registered.keys()]).toEqual(names);
    expect(names.every((name) => name.startsWith('ingredient_'))).toBe(true);
  });

  it('sans le droit d’écriture, ne déclare QUE la lecture', () => {
    const { names, registered } = armTools(false);
    expect(names).toEqual(INGREDIENT_READ_TOOLS);
    expect([...registered.keys()]).toEqual([...INGREDIENT_READ_TOOLS]);
  });
});

describe('declareIngredientAgentTools — lectures', () => {
  it('chaque lecture est un GET sur la route de l’écran', async () => {
    const { call, server } = armTools(true, [FARINE, BEURRE]);
    await call('ingredient_search', { query: '' });
    await call('ingredient_get', { key: 'farine' });
    await call('ingredient_appellations_list');
    await call('ingredient_product_list', { productId: 'p1' });
    await call('ingredient_product_allergens', { productId: 'p1' });
    expect(server.calls).toEqual([
      'GET /pim/ingredients',
      'GET /pim/ingredients',
      'GET /pim/appellations',
      'GET /pim/products/p1/ingredients',
      'GET /pim/products/p1/ingredient-allergens',
    ]);
  });

  it('cherche par appellation et par code d’allergène exact', async () => {
    const { call } = armTools(true, [FARINE, BEURRE, SUCRE]);
    const byScheme = await call('ingredient_search', { query: 'aop' });
    expect(byScheme).toContain('clé beurre');
    expect(byScheme).not.toContain('clé farine');
    const byCode = await call('ingredient_search', { query: 'glu' });
    expect(byCode).toContain('clé farine');
    expect(byCode).not.toContain('clé sucre');
  });

  it('borne la liste rendue et dit qu’elle est coupée', async () => {
    const many = Array.from({ length: SHOWN_INGREDIENTS + 5 }, (_, at) => ingredient(`i-${at}`));
    const { call } = armTools(true, many);
    const text = await call('ingredient_search', {});
    expect(text.split('\n')).toHaveLength(SHOWN_INGREDIENTS + 2);
    expect(text).toContain(`COUPÉE à ${SHOWN_INGREDIENTS} sur ${SHOWN_INGREDIENTS + 5}`);
  });

  it('une matière sans code ne se dit pas « sans allergène »', async () => {
    const { call } = armTools(true, [SUCRE]);
    expect(await call('ingredient_get', { key: 'sucre' })).toContain(
      'ne dit pas « sans allergène »',
    );
  });

  it('les allergènes proposés portent la règle D5 et distinguent l’absence de fiche', async () => {
    const { call } = armTools(true, [FARINE]);
    const text = await call('ingredient_product_allergens', { productId: 'p1' });
    expect(text).toContain('propose : GLU, MLK');
    expect(text).toContain('proposés et non déclarés : MLK');
    expect(text).toContain('AUCUNE fiche réglementaire');
    expect(text).toContain(D5_NOTICE);
  });
});

describe('declareIngredientAgentTools — écritures', () => {
  it('crée par POST /ingredients, puis relit', async () => {
    const { call, server } = armTools(true, []);
    server.ingredients = [];
    const text = await call('ingredient_create', { key: 'noix', nameFr: 'Noix', origin: 'Isère' });
    expect(server.calls).toEqual(['POST /pim/ingredients', 'GET /pim/ingredients']);
    expect(server.bodies[0]).toEqual({ key: 'noix', name: { fr: 'Noix' }, origin: 'Isère' });
    expect(text).toContain('CRÉÉ');
  });

  it('modifie les allergènes en gardant les codes non nommés', async () => {
    const { call, server } = armTools(true, [ingredient('pain', { allergens: ['GLU', 'SES'] })]);
    await call('ingredient_set_allergens', { key: 'pain', add: ['MLK'], remove: ['SES'] });
    expect(server.calls).toContain('PUT /pim/ingredients/pain/allergens');
    expect(server.bodies[0]).toEqual({ codes: ['GLU', 'MLK'] });
  });

  it('ajoute, retire et réordonne par PUT de la liste ENTIÈRE de la fiche', async () => {
    const { call, server } = armTools(true, [FARINE, BEURRE, SUCRE]);
    await call('ingredient_product_add', { productId: 'p1', key: 'sucre', position: 1 });
    expect(server.bodies.at(-1)).toEqual({ keys: ['sucre', 'farine', 'beurre'] });
    await call('ingredient_product_remove', { productId: 'p1', key: 'farine' });
    expect(server.bodies.at(-1)).toEqual({ keys: ['sucre', 'beurre'] });
    await call('ingredient_product_reorder', { productId: 'p1', keys: ['beurre', 'sucre'] });
    expect(server.bodies.at(-1)).toEqual({ keys: ['beurre', 'sucre'] });
    expect(server.calls.filter((line) => line.startsWith('PUT'))).toEqual([
      'PUT /pim/products/p1/ingredients',
      'PUT /pim/products/p1/ingredients',
      'PUT /pim/products/p1/ingredients',
    ]);
  });

  it('n’écrit jamais vers une déclinaison ni la fiche réglementaire', async () => {
    const { call, server } = armTools(true, [FARINE, BEURRE, SUCRE]);
    await call('ingredient_product_add', { productId: 'p1', key: 'sucre' });
    await call('ingredient_set_allergens', { key: 'farine', add: ['EGG'] });
    const writes = server.calls.filter((line) => !line.startsWith('GET'));
    expect(writes.some((line) => line.includes('variant') || line.includes('catalogue'))).toBe(
      false,
    );
  });

  it('refuse sans rien écrire une clé inconnue ou un ordre qui n’est pas une permutation', async () => {
    const { call, server } = armTools(true, [FARINE, BEURRE]);
    expect(await call('ingredient_product_add', { productId: 'p1', key: 'nawak' })).toContain(
      'REFUSÉ',
    );
    expect(
      await call('ingredient_product_reorder', { productId: 'p1', keys: ['farine'] }),
    ).toContain('REFUSÉ');
    expect(server.calls.some((line) => line.startsWith('PUT'))).toBe(false);
  });
});

describe('reordered', () => {
  it('refuse un doublon même de bonne longueur', () => {
    expect(typeof reordered(['a', 'b'], ['a', 'a'])).toBe('string');
    expect(reordered(['a', 'b'], ['b', 'a'])).toEqual(['b', 'a']);
  });
});
