import { Test } from '@nestjs/testing';

import {
  ShopifyAdminClient,
  type ShopifyProductSnapshot,
} from '@lfd/shopify-admin';
import type {
  ChannelMode,
  ShopifySettingsView,
} from '../../shared/settings.service.js';
import { ShopifySettingsService } from '../../shared/settings.service.js';
import { ShopifyInspectionService } from '../inspection.service.js';

function view(mode: ChannelMode): ShopifySettingsView {
  return {
    shopDomain: mode === 'live' ? 'chevallot.myshopify.com' : '',
    apiVersion: '2026-07',
    isEnabled: mode === 'live',
    hasToken: mode === 'live',
    mode,
    updatedAt: null,
  };
}

const PRODUCTS: ShopifyProductSnapshot[] = [
  {
    id: 'gid://shopify/Product/1',
    handle: 'croissant',
    title: 'Croissant',
    status: 'ACTIVE',
    variants: [{ sku: 'PATI-CROISSANT', title: 'Default', price: '1.30' }],
  },
];

async function build(
  mode: ChannelMode,
  listProducts: () => Promise<ShopifyProductSnapshot[]>,
): Promise<ShopifyInspectionService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ShopifyInspectionService,
      {
        provide: ShopifySettingsService,
        useValue: { read: () => Promise.resolve(view(mode)) },
      },
      { provide: ShopifyAdminClient, useValue: { listProducts } },
    ],
  }).compile();
  return moduleRef.get(ShopifyInspectionService);
}

describe('ShopifyInspectionService', () => {
  it('en dry-run, ne lit rien et renvoie une liste vide', async () => {
    const service = await build('dry-run', () =>
      Promise.reject(
        new Error('la boutique ne doit pas être appelée en dry-run'),
      ),
    );

    const result = await service.inspect();

    expect(result.mode).toBe('dry-run');
    expect(result.products).toEqual([]);
  });

  it('en live, renvoie les produits lus sur la boutique', async () => {
    const service = await build('live', () => Promise.resolve(PRODUCTS));

    const result = await service.inspect();

    expect(result.mode).toBe('live');
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.handle).toBe('croissant');
    expect(result.products[0]?.variants[0]?.sku).toBe('PATI-CROISSANT');
  });
});
