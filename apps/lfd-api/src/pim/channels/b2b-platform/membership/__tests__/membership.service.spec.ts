import { Test } from "@nestjs/testing";

import { PimPrismaService } from "../../../../infra/database/pim-prisma.service.js";
import { B2bMembershipService } from "../membership.service.js";

/**
 * Ce que ces tests éprouvent : les **promesses de comportement** du service —
 * idempotence de la publication, silence de la dépublication, séparation entre
 * « décidé » et « poussé ». Le double est réduit à la seule table visée.
 */

interface Row {
  productId: string;
  publishedAt: Date;
  publishedBy: string | null;
  lastPushedAt: Date | null;
}

/** Double minimal de `prisma.b2bChannelBinding`, avec la sémantique d'`upsert`. */
class FakeBindings {
  readonly rows = new Map<string, Row>();

  findMany(): Promise<Row[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  upsert(args: {
    where: { productId: string };
    create: { productId: string; publishedBy: string | null };
  }): Promise<void> {
    if (!this.rows.has(args.where.productId)) {
      this.rows.set(args.where.productId, {
        productId: args.create.productId,
        publishedAt: new Date("2026-08-17T08:00:00.000Z"),
        publishedBy: args.create.publishedBy,
        lastPushedAt: null,
      });
    }
    return Promise.resolve();
  }

  deleteMany(args: { where: { productId: string } }): Promise<void> {
    this.rows.delete(args.where.productId);
    return Promise.resolve();
  }
}

async function build(bindings: FakeBindings): Promise<B2bMembershipService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      B2bMembershipService,
      { provide: PimPrismaService, useValue: { b2bChannelBinding: bindings } },
    ],
  }).compile();
  return moduleRef.get(B2bMembershipService);
}

describe("B2bMembershipService", () => {
  it("publie un produit sur le canal", async () => {
    const service = await build(new FakeBindings());

    await service.publish("prd_1", "cecile");

    expect(await service.publishedProductIds()).toEqual(["prd_1"]);
  });

  it("republier ne réécrit ni la date ni l’auteur — c’est la PREMIÈRE mise en vente qui répond", async () => {
    const bindings = new FakeBindings();
    const service = await build(bindings);

    await service.publish("prd_1", "cecile");
    await service.publish("prd_1", "hugo");

    expect(bindings.rows.get("prd_1")?.publishedBy).toBe("cecile");
    expect(bindings.rows.size).toBe(1);
  });

  it("dépublier retire la ligne", async () => {
    const service = await build(new FakeBindings());
    await service.publish("prd_1", null);

    await service.unpublish("prd_1");

    expect(await service.publishedProductIds()).toEqual([]);
  });

  it("dépublier un produit absent ne lève pas — le résultat voulu est le même", async () => {
    const service = await build(new FakeBindings());

    await expect(service.unpublish("jamais_publie")).resolves.toBeUndefined();
  });

  it("distingue « décidé » de « poussé » : publié mais jamais parti rend lastPushedAt null", async () => {
    const service = await build(new FakeBindings());
    await service.publish("prd_1", "cecile");

    const [view] = await service.list();

    expect(view?.publishedAt).toBe("2026-08-17T08:00:00.000Z");
    expect(view?.lastPushedAt).toBeNull();
  });
});
