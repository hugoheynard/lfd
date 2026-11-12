import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../data/models';
import { CatalogueApi } from './catalogue-api';
import { ProductListStore } from './product-list-store';
import type { ProductListing } from './product-http-api';

/**
 * La liste des fiches (`le-cache-du-back-office.md`, § 5.4) : une lecture à la
 * première ouverture, une relecture en fond qui garde la copie sur un échec.
 */

function product(id: string): Product {
  return { id, sku: id.toUpperCase(), name: { fr: id } } as Product;
}

function at(version: number, ...ids: string[]): ProductListing {
  return { version, items: ids.map(product) };
}

class FakeApi {
  reads = 0;
  answer: () => Promise<ProductListing> = () => Promise.resolve(at(1, 'a'));
  listProducts(): Promise<ProductListing> {
    this.reads += 1;
    return this.answer();
  }
}

describe('ProductListStore', () => {
  let api: FakeApi;
  let store: ProductListStore;

  beforeEach(() => {
    api = new FakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: CatalogueApi, useValue: api }] });
    store = TestBed.inject(ProductListStore);
  });

  it('ne lit rien avant la première ouverture, puis une seule fois', async () => {
    expect(api.reads).toBe(0);
    await store.open();
    await store.open();
    expect(api.reads).toBe(1);
    expect(store.state()).toBe('ready');
    expect(store.products().map((p) => p.id)).toEqual(['a']);
  });

  it('se relit en fond sans repasser par le chargement', async () => {
    await store.open();
    api.answer = () => Promise.resolve(at(2, 'a', 'b'));
    const refreshing = store.refresh();
    expect(store.state()).toBe('ready');
    await refreshing;
    expect(store.products().map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('garde la copie quand la relecture en fond échoue', async () => {
    await store.open();
    api.answer = () => Promise.reject(new Error('panne'));
    await store.refresh();
    expect(store.products().map((p) => p.id)).toEqual(['a']);
    expect(store.loadError()).toBeNull();
  });

  it('ne relit rien en fond tant que la première lecture n’a pas abouti', async () => {
    await store.refresh();
    expect(api.reads).toBe(0);
  });

  it('dit l’échec de la première lecture, et la réouverture relit', async () => {
    api.answer = () => Promise.reject(new Error('panne'));
    await store.open();
    expect(store.state()).toBe('error');
    expect(store.loadError()).not.toBeNull();
    api.answer = () => Promise.resolve(at(1, 'a'));
    await store.open();
    expect(store.state()).toBe('ready');
  });

  it('retire une fiche supprimée sans relire', async () => {
    await store.open();
    store.remove('a');
    expect(store.products()).toEqual([]);
    expect(api.reads).toBe(1);
  });

  it('retient le numéro servi avec la liste, et adopte celui d’une relecture', async () => {
    expect(store.version()).toBeNull();
    await store.open();
    expect(store.version()).toBe(1);
    api.answer = () => Promise.resolve(at(5, 'a'));
    await store.refresh();
    expect(store.version()).toBe(5);
  });

  it('garde son numéro quand la relecture en fond échoue', async () => {
    await store.open();
    api.answer = () => Promise.reject(new Error('panne'));
    await store.refresh();
    expect(store.version()).toBe(1);
  });
});
