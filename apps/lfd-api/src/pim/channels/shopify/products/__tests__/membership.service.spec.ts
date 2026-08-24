import { Test } from "@nestjs/testing";

import { ShopifyAdminClient } from "@lfd/shopify-admin";
import { LiveShopifyCollectionsGateway } from "../../collections/gateway.js";
import { ShopifyMembershipService } from "../membership.service.js";

interface AddCall {
  collectionId: string;
  productIds: readonly string[];
}

async function build(
  collections: { handle: string; id: string }[],
  /** Ce à quoi le produit appartient DÉJÀ chez le marchand. */
  held: readonly string[] = [],
): Promise<{ service: ShopifyMembershipService; adds: AddCall[]; removes: AddCall[] }> {
  const adds: AddCall[] = [];
  const removes: AddCall[] = [];
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
          addProductsToCollection: (collectionId: string, productIds: readonly string[]) => {
            adds.push({ collectionId, productIds });
            return Promise.resolve();
          },
          collectionHandlesOfProduct: () => Promise.resolve([...held]),
          removeProductsFromCollection: (collectionId: string, productIds: readonly string[]) => {
            removes.push({ collectionId, productIds });
            return Promise.resolve();
          },
        },
      },
    ],
  }).compile();
  return { service: moduleRef.get(ShopifyMembershipService), adds, removes };
}

describe("ShopifyMembershipService", () => {
  it("range le produit dans la collection résolue par tag", async () => {
    const { service, adds } = await build([{ handle: "tva-5-5", id: "gid-55" }]);

    const outcome = await service.assign("gid-prod", ["tva-5-5"]);

    expect(outcome.joined).toEqual(["tva-5-5"]);
    expect(outcome.left).toEqual([]);
    expect(outcome.missing).toEqual([]);
    expect(adds[0]).toEqual({
      collectionId: "gid-55",
      productIds: ["gid-prod"],
    });
  });

  it("rapporte (sans créer) une collection absente, et ne la range pas", async () => {
    const { service, adds } = await build([{ handle: "tva-5-5", id: "gid-55" }]);

    const outcome = await service.assign("gid-prod", ["tva-10"]);

    expect(outcome.joined).toEqual([]);
    expect(outcome.missing).toEqual(["tva-10"]);
    expect(adds).toHaveLength(0);
  });

  it("sans tag, ne fait rien", async () => {
    const { service, adds } = await build([]);
    const outcome = await service.assign("gid-prod", []);
    expect(outcome).toEqual({ joined: [], left: [], missing: [] });
    expect(adds).toHaveLength(0);
  });
});

describe("ShopifyMembershipService — un seul taux à la fois (S2)", () => {
  it("QUITTE la collection de l'ancien taux", async () => {
    // La panne la plus chère du lot : un article dont le taux change restait
    // membre de son ancienne collection, la boutique le taxait selon elle, et
    // rien ne le signalait. Rejoindre ne suffit pas.
    const { service, removes } = await build(
      [
        { handle: "tva-5-5", id: "gid-55" },
        { handle: "tva-20", id: "gid-20" },
      ],
      ["tva-5-5"],
    );

    const outcome = await service.assign("gid-prod", ["tva-20"]);

    expect(outcome.joined).toEqual(["tva-20"]);
    expect(outcome.left).toEqual(["tva-5-5"]);
    expect(removes).toEqual([{ collectionId: "gid-55", productIds: ["gid-prod"] }]);
  });

  it("ne touche PAS aux collections du marchand", async () => {
    // Les collections hors `tva-*` appartiennent à la boutique : « Noël »,
    // « Nouveautés ». Ce service n'a rien à y dire.
    const { service, removes } = await build(
      [
        { handle: "tva-20", id: "gid-20" },
        { handle: "noel", id: "gid-noel" },
      ],
      ["noel"],
    );

    const outcome = await service.assign("gid-prod", ["tva-20"]);

    expect(outcome.left).toEqual([]);
    expect(removes).toEqual([]);
  });
});
