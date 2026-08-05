import { Test } from '@nestjs/testing';

import { ShopifyAdminClient } from '@lfd/shopify-admin';
import { LiveShopifyCollectionsGateway } from '../../collections/gateway.js';
import { ShopifyMembershipService } from '../membership.service.js';

interface AddCall {
  collectionId: string;
  productIds: readonly string[];
}

async function build(
  collections: { handle: string; id: string }[],
): Promise<{ service: ShopifyMembershipService; adds: AddCall[] }> {
  const adds: AddCall[] = [];
  const moduleRef = await Test.createTestingModule({
    providers: [
      ShopifyMembershipService,
      {
        provide: LiveShopifyCollectionsGateway,
        useValue: {
          list: () =>
            Promise.resolve(
              collections.map((c) => ({
                id: c.id,
                handle: c.handle,
                title: c.handle,
                productCount: 0,
              })),
            ),
        },
      },
      {
        provide: ShopifyAdminClient,
        useValue: {
          addProductsToCollection: (
            collectionId: string,
            productIds: readonly string[],
          ) => {
            adds.push({ collectionId, productIds });
            return Promise.resolve();
          },
        },
      },
    ],
  }).compile();
  return { service: moduleRef.get(ShopifyMembershipService), adds };
}

describe('ShopifyMembershipService', () => {
  it('range le produit dans la collection résolue par tag', async () => {
    const { service, adds } = await build([
      { handle: 'tva-5-5', id: 'gid-55' },
    ]);

    const outcome = await service.assign('gid-prod', ['tva-5-5']);

    expect(outcome.joined).toEqual(['tva-5-5']);
    expect(outcome.missing).toEqual([]);
    expect(adds[0]).toEqual({
      collectionId: 'gid-55',
      productIds: ['gid-prod'],
    });
  });

  it('rapporte (sans créer) une collection absente, et ne la range pas', async () => {
    const { service, adds } = await build([
      { handle: 'tva-5-5', id: 'gid-55' },
    ]);

    const outcome = await service.assign('gid-prod', ['tva-10']);

    expect(outcome.joined).toEqual([]);
    expect(outcome.missing).toEqual(['tva-10']);
    expect(adds).toHaveLength(0);
  });

  it('sans tag, ne fait rien', async () => {
    const { service, adds } = await build([]);
    const outcome = await service.assign('gid-prod', []);
    expect(outcome).toEqual({ joined: [], missing: [] });
    expect(adds).toHaveLength(0);
  });
});
