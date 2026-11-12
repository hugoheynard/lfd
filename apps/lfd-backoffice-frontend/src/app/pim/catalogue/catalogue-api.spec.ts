import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CatalogueApi } from './catalogue-api';
import { CategoryStore } from './category-store';
import { ProductHttpApi } from './product-http-api';
import { VatRateStore } from './vat-rates/vat-store';

/**
 * La fiche lit les familles et les taux dans leurs stores, sans relecture
 * forcée (`le-cache-du-back-office.md`, § 5.4) — sauf quand le droit de la
 * route manque : le store n'est alors pas suivi par le numéro `pim` (§ 4.4).
 */

function fakeStore() {
  const calls = { ensure: 0, reload: 0 };
  return {
    calls,
    items: signal([]),
    ensure: () => {
      calls.ensure += 1;
      return Promise.resolve();
    },
    reload: () => {
      calls.reload += 1;
      return Promise.resolve();
    },
  };
}

function setUp(granted: readonly string[]) {
  const categories = fakeStore();
  const rates = fakeStore();
  TestBed.configureTestingModule({
    providers: [
      { provide: CategoryStore, useValue: categories },
      { provide: VatRateStore, useValue: rates },
      { provide: ProductHttpApi, useValue: {} },
      { provide: PermissionsStore, useValue: { can: (p: string) => granted.includes(p) } },
    ],
  });
  return { api: TestBed.inject(CatalogueApi), categories, rates };
}

describe('CatalogueApi — familles et taux', () => {
  it('ne force aucune relecture quand les droits ouvrent les deux routes', async () => {
    const { api, categories, rates } = setUp(['pim_catalog:read', 'pim_tax:read']);
    await api.listCategories();
    await api.listVatRates();
    expect(categories.calls).toEqual({ ensure: 1, reload: 0 });
    expect(rates.calls).toEqual({ ensure: 1, reload: 0 });
  });

  it('relit la TVA à chaque ouverture sans `pim_tax:read`', async () => {
    const { api, rates } = setUp(['pim_catalog:read']);
    await api.listVatRates();
    expect(rates.calls).toEqual({ ensure: 0, reload: 1 });
  });
});
