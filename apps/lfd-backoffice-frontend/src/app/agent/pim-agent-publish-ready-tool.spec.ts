import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CategoryHttpApi } from '../pim/catalogue/category-http-api';
import { ProductHttpApi, type ProductDetail } from '../pim/catalogue/product-http-api';
import { EMPTY_NUTRITION, type Product, type ProductStatus } from '../pim/data/models';

import { declarePimReadinessAgentTools } from './pim-agent-readiness-tools';

interface RegisteredTool {
  readonly name: string;
  readonly execute: (args: Record<string, unknown>) => Promise<string>;
}

function product(id: string, status: ProductStatus): Product {
  return {
    id,
    sku: `SKU-${id}`,
    name: { fr: `Fiche ${id}` },
    kind: 'daily',
    categoryId: 'c1',
    status,
    variants: [],
    vatByContext: {},
    operationOnly: false,
    requiresCold: false,
    audience: null,
  };
}

function detailOf(row: Product): ProductDetail {
  return {
    product: row,
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
    media: [],
    readiness: null,
    readinessStale: false,
    lineage: { origin: null, detachedTo: {} },
  };
}

const ROWS = [
  product('a', 'draft'),
  product('b', 'draft'),
  product('c', 'published'),
  product('d', 'draft'),
  product('e', 'archived'),
];

function refusal(status: number, message: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { message } });
}

function arm(answers: Readonly<Record<string, HttpErrorResponse>> = {}) {
  const registered: RegisteredTool[] = [];
  const published: string[] = [];
  const read: string[] = [];
  let inFlight = 0;
  let peak = 0;
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
  const track = async <T>(run: () => T): Promise<T> => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight -= 1;
    return run();
  };
  const products: Pick<ProductHttpApi, 'list' | 'getDetail' | 'publish' | 'unpublish'> = {
    list: () => Promise.resolve(ROWS),
    getDetail: (id) =>
      track(() => {
        read.push(id);
        const row = ROWS.find((r) => r.id === id);
        return row === undefined ? null : detailOf(row);
      }),
    publish: (id) =>
      track(() => {
        published.push(id);
        const answer = answers[id];
        if (answer !== undefined) {
          throw answer;
        }
      }),
    unpublish: () => Promise.resolve(),
  };
  const categories: Pick<CategoryHttpApi, 'list'> = { list: () => Promise.resolve([]) };
  TestBed.configureTestingModule({
    providers: [
      { provide: ProductHttpApi, useValue: products },
      { provide: CategoryHttpApi, useValue: categories },
    ],
  });
  let names: readonly string[] = [];
  runInInjectionContext(TestBed.inject(Injector), () => {
    names = declarePimReadinessAgentTools();
  });
  const tool = (name: string): RegisteredTool => {
    const found = registered.find((row) => row.name === name);
    if (found === undefined) {
      throw new Error(`L'outil ${name} n'a pas été enregistré.`);
    }
    return found;
  };
  return { tool, names, published, read, peak: () => peak };
}

beforeEach(() => Reflect.deleteProperty(document, 'modelContext'));
afterEach(() => {
  Reflect.deleteProperty(document, 'modelContext');
  TestBed.resetTestingModule();
});

describe('pim_product_readiness sans productId', () => {
  it('borne les lectures de détail en vol', async () => {
    const { tool, read, peak } = arm();
    await tool('pim_product_readiness').execute({});
    expect(read).toEqual(['a', 'b', 'c', 'd']);
    expect(peak()).toBeLessThanOrEqual(4);
  });

  it('filtre par status', async () => {
    const { tool, read } = arm();
    const text = await tool('pim_product_readiness').execute({ status: 'published' });
    expect(read).toEqual(['c']);
    expect(text).toContain('SKU-c');
  });
});

describe('pim_products_publish_ready', () => {
  it('est déclaré et rendu dans la liste', () => {
    expect(arm().names).toContain('pim_products_publish_ready');
  });

  it('publie les brouillons en série, jamais en parallèle', async () => {
    const { tool, published, peak } = arm();
    const text = await tool('pim_products_publish_ready').execute({});
    expect(published).toEqual(['a', 'b', 'd']);
    expect(peak()).toBe(1);
    expect(text).toContain('3 fiche(s) publiée(s), 0 refus.');
  });

  it('liste chaque refus avec la fiche et le message du serveur, sans s’arrêter', async () => {
    const { tool, published } = arm({
      a: refusal(409, 'SKU-a-1 : prix pro absent'),
      b: refusal(409, 'SKU-b-1 : allergènes non déclarés'),
    });
    const text = await tool('pim_products_publish_ready').execute({});
    expect(published).toEqual(['a', 'b', 'd']);
    expect(text).toContain('1 fiche(s) publiée(s), 2 refus.');
    expect(text).toContain('refus : SKU-a — Fiche a — SKU-a-1 : prix pro absent');
    expect(text).toContain('refus : SKU-b — Fiche b — SKU-b-1 : allergènes non déclarés');
  });

  it('s’arrête sur un 429 et le dit', async () => {
    const { tool, published } = arm({ b: refusal(429, 'Trop de requêtes.') });
    const text = await tool('pim_products_publish_ready').execute({});
    expect(published).toEqual(['a', 'b']);
    expect(text).toContain('ARRÊT : 429');
    expect(text).toContain('2 fiche(s) non tentée(s)');
  });

  it('s’arrête sur un serveur muet', async () => {
    const { tool, published } = arm({ a: refusal(0, '') });
    const text = await tool('pim_products_publish_ready').execute({});
    expect(published).toEqual(['a']);
    expect(text).toContain('ARRÊT : 0');
  });

  it('ne tente que les productIds donnés', async () => {
    const { tool, published } = arm();
    await tool('pim_products_publish_ready').execute({ productIds: ['d', 'c'] });
    expect(published).toEqual(['d', 'c']);
  });
});
