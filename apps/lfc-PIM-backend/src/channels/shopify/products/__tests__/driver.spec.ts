import { Test } from '@nestjs/testing';

import { ShopifyAdminClient, ShopifyRejectedError } from '@lfd/shopify-admin';
import { LiveShopifyDriver } from '../driver.js';
import { buildProductSetInput } from '../product-set-input.js';
import type { ShopifyProductPayload } from '../projection.js';

const PAYLOAD: ShopifyProductPayload = {
  title: 'Croissant',
  handle: 'croissant',
  status: 'ACTIVE',
  variants: [
    { sku: 'PATI-CROISSANT', title: 'Défaut', options: {}, price: '1.30' },
  ],
};

const OK_RESPONSE = {
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
};

/** Enregistre l'appel GraphQL pour verrouiller la forme envoyée à Shopify. */
class GraphqlRecorder {
  readonly calls: { query: string; variables: Record<string, unknown> }[] = [];

  constructor(private readonly response: unknown) {}

  readonly graphql = (
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<unknown> => {
    this.calls.push({ query, variables });
    return Promise.resolve(this.response);
  };
}

async function driverWith(
  recorder: GraphqlRecorder,
): Promise<LiveShopifyDriver> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LiveShopifyDriver,
      { provide: ShopifyAdminClient, useValue: { graphql: recorder.graphql } },
    ],
  }).compile();
  return moduleRef.get(LiveShopifyDriver);
}

describe('LiveShopifyDriver', () => {
  it('renvoie le GID produit + la map SKU → GID variante', async () => {
    const driver = await driverWith(new GraphqlRecorder(OK_RESPONSE));

    const result = await driver.push(PAYLOAD);

    expect(result.productGid).toBe('gid://shopify/Product/1');
    expect(result.variantGids['PATI-CROISSANT']).toBe(
      'gid://shopify/ProductVariant/9',
    );
  });

  // I2 : upsert par `identifier: { handle }`, jamais l'ancien `{ key }` cassé.
  it('cible l’upsert par handle et envoie la sortie du mapper', async () => {
    const recorder = new GraphqlRecorder(OK_RESPONSE);
    const driver = await driverWith(recorder);

    await driver.push(PAYLOAD);

    const { variables } = recorder.calls[0] ?? { variables: {} };
    expect(variables['identifier']).toEqual({ handle: 'croissant' });
    expect(variables['identifier']).not.toHaveProperty('key');
    // Le driver envoie exactement l'entrée construite par le mapper (pas de forme divergente).
    expect(variables['input']).toEqual(buildProductSetInput(PAYLOAD));
  });

  it('jette une ShopifyRejectedError sur userErrors', async () => {
    const driver = await driverWith(
      new GraphqlRecorder({
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
