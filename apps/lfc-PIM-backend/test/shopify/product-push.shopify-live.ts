import type { ShopifyAdminClient } from '../../src/channels/shopify/shared/admin-client.js';
import type { ShopifyProductPayload } from '../../src/channels/shopify/products/projection.js';
import { buildLiveContext, liveE2eEnabled } from './live-context.js';

/**
 * E2E **live** du push produit — tape la vraie dev store via le vrai driver.
 * `describe.skip` sans les identifiants + le flag `SHOPIFY_LIVE_E2E=1` : jamais en CI.
 * Nettoie derrière lui (le produit d'e2e est supprimé en `afterAll`).
 */
const run = liveE2eEnabled() ? describe : describe.skip;

const HANDLE = 'e2e-live-product-push';

function payload(price: string): ShopifyProductPayload {
  return {
    title: 'E2E Live Product',
    handle: HANDLE,
    status: 'DRAFT',
    variants: [{ sku: 'E2E-LIVE-1', title: 'Défaut', options: {}, price }],
  };
}

run('Shopify live — product push (productSet)', () => {
  let client: ShopifyAdminClient | null = null;
  let productGid: string | null = null;

  afterAll(async () => {
    if (client !== null && productGid !== null) {
      await client.graphql(
        `mutation { productDelete(input: { id: "${productGid}" }) { deletedProductId } }`,
      );
    }
  });

  it('crée un produit inexistant (handle neuf)', async () => {
    const ctx = await buildLiveContext();
    client = ctx.client;

    const result = await ctx.driver.push(payload('1.50'));
    productGid = result.productGid;

    expect(result.productGid).toMatch(/^gid:\/\/shopify\/Product\//);
    expect(result.variantGids['E2E-LIVE-1']).toBeTruthy();
  });

  it('met à jour EN PLACE au re-push (même produit, pas de doublon)', async () => {
    const ctx = await buildLiveContext();

    const again = await ctx.driver.push(payload('2.50'));

    // Même GID → upsert par handle, pas de duplication.
    expect(again.productGid).toBe(productGid);
  });
});
