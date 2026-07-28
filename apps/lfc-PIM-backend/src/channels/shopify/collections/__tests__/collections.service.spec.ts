import { Test } from '@nestjs/testing';

import {
  DryRunShopifyCollectionsGateway,
  LiveShopifyCollectionsGateway,
} from '../gateway.js';
import { ShopifyCollectionsService } from '../collections.service.js';
import type { ShopifySettingsView } from '../../shared/settings.service.js';
import { ShopifySettingsService } from '../../shared/settings.service.js';

const DRY_RUN_VIEW: ShopifySettingsView = {
  shopDomain: '',
  apiVersion: '2026-07',
  isEnabled: false,
  hasToken: false,
  mode: 'dry-run',
  updatedAt: null,
};

/** Les trois régimes de la démo. `tva-8-5` est volontairement absent → orpheline. */
const DESIRED = [
  { handle: 'tva-5-5', title: 'TVA 5,5 %' },
  { handle: 'tva-10', title: 'TVA 10 %' },
  { handle: 'tva-20', title: 'TVA 20 %' },
];

async function buildService(): Promise<ShopifyCollectionsService> {
  const liveForbidden = {
    list: () => Promise.reject(new Error('live interdit en dry-run')),
    create: () => Promise.reject(new Error('live interdit en dry-run')),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      ShopifyCollectionsService,
      DryRunShopifyCollectionsGateway,
      { provide: LiveShopifyCollectionsGateway, useValue: liveForbidden },
      {
        provide: ShopifySettingsService,
        useValue: { read: () => Promise.resolve(DRY_RUN_VIEW) },
      },
    ],
  }).compile();
  return moduleRef.get(ShopifyCollectionsService);
}

describe('ShopifyCollectionsService (dry-run)', () => {
  it('inspecte : présentes amorcées, tva-20 manquante, tva-8-5 orpheline', async () => {
    const service = await buildService();

    const { mode, reconciliation } = await service.inspect(DESIRED);

    expect(mode).toBe('dry-run');
    const missing = reconciliation.rows
      .filter((row) => !row.present)
      .map((row) => row.handle);
    expect(missing).toEqual(['tva-20']);
    expect(reconciliation.orphans.map((o) => o.handle)).toEqual(['tva-8-5']);
  });

  it('pousse : crée la manquante et referme la boucle', async () => {
    const service = await buildService();

    const result = await service.push(DESIRED);

    expect(result.created.map((c) => c.handle)).toEqual(['tva-20']);
    expect(result.reconciliation.missingCount).toBe(0);
    expect(
      result.reconciliation.rows.find((row) => row.handle === 'tva-20')
        ?.present,
    ).toBe(true);
  });
});
