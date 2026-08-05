import { Test } from '@nestjs/testing';

import { ShopifyAdminClient } from '../../shared/admin-client.js';
import { ShopifyRejectedError } from '../../shared/errors.js';
import { LiveShopifyDriver } from '../driver.js';
import type { ShopifyProductPayload } from '../projection.js';

const PAYLOAD: ShopifyProductPayload = {
  title: 'Croissant',
  handle: 'croissant',
  status: 'ACTIVE',
  variants: [
    { sku: 'PATI-CROISSANT', title: 'Défaut', options: {}, price: '1.30' },
  ],
};

async function driverWith(
  graphql: () => Promise<unknown>,
): Promise<LiveShopifyDriver> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LiveShopifyDriver,
      { provide: ShopifyAdminClient, useValue: { graphql } },
    ],
  }).compile();
  return moduleRef.get(LiveShopifyDriver);
}

describe('LiveShopifyDriver', () => {
  it('renvoie le GID produit + la map SKU → GID variante', async () => {
    const driver = await driverWith(() =>
      Promise.resolve({
        productSet: {
          product: {
            id: 'gid://shopify/Product/1',
            handle: 'croissant',
            variants: {
              nodes: [
                { id: 'gid://shopify/ProductVariant/9', sku: 'PATI-CROISSANT' },
              ],
            },
          },
          userErrors: [],
        },
      }),
    );

    const result = await driver.push(PAYLOAD);

    expect(result.productGid).toBe('gid://shopify/Product/1');
    expect(result.variantGids['PATI-CROISSANT']).toBe(
      'gid://shopify/ProductVariant/9',
    );
  });

  it('jette une ShopifyRejectedError sur userErrors', async () => {
    const driver = await driverWith(() =>
      Promise.resolve({
        productSet: {
          product: null,
          userErrors: [{ field: ['handle'], message: 'Handle invalide' }],
        },
      }),
    );

    await expect(driver.push(PAYLOAD)).rejects.toBeInstanceOf(
      ShopifyRejectedError,
    );
  });
});
