import { Test } from "@nestjs/testing";

import type { ShopifyProductSnapshot } from "@lfd/shopify-admin";
import { SalesContextRegistry } from "../../../../catalogue/shared/domain/ports/sales-context.registry.js";
import { CatalogueReader } from "../../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { PimPrismaService } from "../../../../infra/database/pim-prisma.service.js";
import { ShopifyInspectionService } from "../inspection.service.js";
import { fingerprint, projectProduct } from "../projection.js";
import { ShopifyReconciliationService } from "../reconciliation.service.js";
import { payloadColumn } from "../snapshot-payload.js";

function product(): ProductRecord {
  return {
    id: "p1",
    sku: "PATI-CROISSANT",
    name: { fr: "Croissant" },
    slug: { fr: "croissant" },
    kind: "daily",
    categoryId: "c1",
    status: "published",
    vatByContext: {},
    channelOverride: null,
    variants: [
      {
        id: "v1",
        sku: "PATI-CROISSANT",
        name: { fr: "Nature" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 130,
        weightGrams: null,
        allergens: null,
        nutrition: null,
      },
    ],
  };
}

/** THEIRS reflétant exactement le BASE (produit publié → ACTIVE, prix 1.30). */
function alignedRemote(price = "1.30"): ShopifyProductSnapshot {
  return {
    id: "gid://shopify/Product/1",
    handle: "croissant",
    title: "Croissant",
    status: "ACTIVE",
    variants: [{ sku: "PATI-CROISSANT", title: "Nature", price }],
  };
}

async function build(
  mode: "live" | "dry-run",
  remoteProducts: ShopifyProductSnapshot[],
): Promise<ShopifyReconciliationService> {
  const basePayload = projectProduct(product(), null, true);
  const prisma = {
    shopifyProductBinding: {
      findMany: () => Promise.resolve([{ headSnapshotId: "snap_1" }]),
    },
    shopifyPushSnapshot: {
      findMany: () =>
        Promise.resolve([
          {
            handle: "croissant",
            hash: fingerprint(basePayload),
            payload: payloadColumn(basePayload),
          },
        ]),
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ShopifyReconciliationService,
      {
        provide: CatalogueReader,
        useValue: {
          publishable: () => Promise.resolve([product()]),
          editorials: () => Promise.resolve(new Map()),
          // La fiche est vendue au comptoir : sinon la réconciliation la
          // comparerait à un brouillon, ce que ce test ne cherche pas.
          effectiveChannels: (items: readonly { id: string }[]) =>
            Promise.resolve(
              new Map(
                items.map((item) => [item.id, [{ locationId: "emp_1", context: "emporter" }]]),
              ),
            ),
        },
      },
      { provide: PimPrismaService, useValue: prisma },
      {
        provide: SalesContextRegistry,
        useValue: {
          active: () =>
            Promise.resolve([
              {
                id: "ctx_emporter",
                key: "emporter",
                label: "À emporter",
                handleSuffix: "",
                channelKey: "emporter",
                active: true,
                shopifyProjected: true,
                position: 1,
              },
            ]),
        },
      },
      {
        provide: ShopifyInspectionService,
        useValue: {
          inspect: () => Promise.resolve({ mode, products: remoteProducts }),
        },
      },
    ],
  }).compile();
  return moduleRef.get(ShopifyReconciliationService);
}

describe("ShopifyReconciliationService", () => {
  it("up_to_date quand OURS, BASE et THEIRS coïncident", async () => {
    const service = await build("live", [alignedRemote()]);

    const board = await service.board();

    expect(board.mode).toBe("live");
    expect(board.rows[0]?.status).toBe("up_to_date");
    expect(board.rows[0]?.remoteDrift).toBe(false);
  });

  it("remote_drift ⚠️ quand la boutique a changé un prix depuis la dernière poussée", async () => {
    const service = await build("live", [alignedRemote("9.99")]);

    const board = await service.board();

    expect(board.rows[0]?.status).toBe("remote_drift");
    expect(board.rows[0]?.remoteDrift).toBe(true);
  });

  it("un handle disparu de la boutique compte comme dérive distante", async () => {
    const service = await build("live", []);

    const board = await service.board();

    expect(board.rows[0]?.status).toBe("remote_drift");
  });

  it("en dry-run, la boutique est inconnue (jamais « à jour » par défaut)", async () => {
    const service = await build("dry-run", []);

    const board = await service.board();

    expect(board.mode).toBe("dry-run");
    expect(board.rows[0]?.status).toBe("unknown");
  });

  it("le détail expose les trois états et les diffs par paire", async () => {
    const service = await build("live", [alignedRemote("9.99")]);

    const detail = await service.detail("croissant");

    expect(detail.ours?.handle).toBe("croissant");
    expect(detail.base?.handle).toBe("croissant");
    expect(detail.theirs?.handle).toBe("croissant");
    expect(detail.theirsVsBase.some((d) => d.field === "Déclinaisons")).toBe(true);
    expect(detail.oursVsBase).toHaveLength(0);
  });
});
