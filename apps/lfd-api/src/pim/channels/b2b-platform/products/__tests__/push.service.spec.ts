import { CommandBus } from "@nestjs/cqrs";

import { Clock } from "../../../../../platform/time/clock.js";
import { CatalogRevisionRepository } from "../../../../catalogue/revision/domain/ports/catalog-revision.repository.js";
import { Test } from "@nestjs/testing";
import { CATALOG_SNAPSHOT_VERSION, type CatalogSnapshot } from "@lfd/catalog-sync";

import type { ProductRecord } from "../../../../catalogue/product/domain/ports/product.repository.js";
import { PimPrismaService } from "../../../../infra/database/pim-prisma.service.js";
import { B2bCatalogDriver, DryRunB2bCatalogDriver } from "../driver.js";
import { B2bCatalogFeedPreview } from "../feed-preview.js";
import { IncoProjector } from "../../../../allergens/domain/services/inco-projector.js";
import { projectCatalog } from "../projection.js";
import { B2bCatalogPushService } from "../push.service.js";

/** Un snapshot vide mais valide — ce que le port rend quand rien n'est publié. */
function emptySnapshot(generatedAt: string) {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt,
    categories: [],
    products: [],
  } as const;
}

/**
 * Ce que ces tests éprouvent : ce que le push **estampille**, et quand. C'est là
 * que se joue l'honnêteté de l'écran — un `lastPushedAt` posé trop tôt fait
 * passer un échec pour un catalogue en ligne.
 */

function product(over: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: "prd_1",
    sku: "VIE-001",
    name: { fr: "Croissant" },
    slug: { fr: "croissant" },
    kind: "daily",
    categoryId: "cat_vien",
    status: "published",
    vatByContext: {},
    channelOverride: null,
    variants: [
      {
        id: "var_1",
        sku: "VIE-001-1",
        name: { fr: "Croissant" },
        options: {},
        isDefault: true,
        isDiscontinued: false,
        position: 0,
        priceCents: 200,
        weightGrams: null,
        allergens: null,
        nutrition: null,
      },
    ],
    ...over,
  };
}

const category = {
  id: "cat_vien",
  name: { fr: "Viennoiseries" },
  slug: { fr: "viennoiseries" },
  parentId: null,
  position: 0,
  vatByContext: { takeaway: 5.5, b2b: 5.5 },
};

/** Enregistre les `updateMany` pour dire QUI a été estampillé. */
class SpyBindings {
  readonly stamped: string[][] = [];

  updateMany(args: { where: { productId: { in: string[] } } }): Promise<{ count: number }> {
    this.stamped.push(args.where.productId.in);
    return Promise.resolve({ count: args.where.productId.in.length });
  }
}

interface Harness {
  readonly service: B2bCatalogPushService;
  readonly bindings: SpyBindings;
  readonly sent: CatalogSnapshot[];
}

async function build(
  publishedIds: readonly string[],
  products: readonly ProductRecord[],
): Promise<Harness> {
  const bindings = new SpyBindings();
  const sent: CatalogSnapshot[] = [];

  const live = {
    mode: "live" as const,
    send: (snapshot: CatalogSnapshot) => {
      sent.push(snapshot);
      return Promise.resolve({
        acceptedProducts: snapshot.products.length,
        acceptedVariants: 1,
        acceptedCategories: snapshot.categories.length,
        removedSkus: [],
        appliedAt: snapshot.generatedAt,
      });
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      B2bCatalogPushService,
      DryRunB2bCatalogDriver,
      { provide: B2bCatalogDriver, useValue: live },
      // Le service ne projette plus lui-même : il consomme le port de lecture.
      // Le double est d'autant plus court — c'était le but de l'extraction.
      // Le push FIGE une révision avant d'envoyer, puis y inscrit sa
      // destination : ces trois doublures sont le prix de ce couplage, et il est
      // voulu — une publication qui ne laisse pas d'ancre ne dit pas ce qui est
      // parti.
      {
        provide: CommandBus,
        useValue: {
          execute: () => Promise.resolve({ id: "rev_1", version: 1, hash: "h", created: true }),
        },
      },
      {
        provide: CatalogRevisionRepository,
        useValue: { recordPublication: () => Promise.resolve() },
      },
      { provide: Clock, useValue: { now: () => new Date("2026-08-31T10:00:00.000Z") } },
      {
        provide: B2bCatalogFeedPreview,
        useValue: {
          preview: (generatedAt: string) =>
            Promise.resolve(
              publishedIds.length === 0
                ? { snapshot: emptySnapshot(generatedAt), candidates: 0, excluded: [] }
                : {
                    ...projectCatalog(
                      [...products],
                      [category],
                      // Le taux effectif, résolu en amont — ici celui de la
                      // famille, puisque aucune fiche ne déroge.
                      new Map(products.map((p) => [p.id, category.vatByContext])),
                      // Et les canaux : ces fiches se vendent aux professionnels,
                      // sinon ce canal les écarterait.
                      new Map(
                        products.map((p) => [p.id, [{ pointOfSaleId: "pos_b2b", context: "b2b" }]]),
                      ),
                      // Rapport neutre : ce test parle de PUSH, pas de tarif.
                      10_000,
                      // Référentiel vide : aucune fiche n'est déclarée ici, donc
                      // rien à projeter — ce test parle d'estampille.
                      IncoProjector.from([], "fr"),
                      generatedAt,
                    ),
                    candidates: publishedIds.length,
                  },
            ),
        },
      },
      {
        provide: PimPrismaService,
        useValue: { b2bChannelBinding: bindings },
      },
    ],
  }).compile();

  return { service: moduleRef.get(B2bCatalogPushService), bindings, sent };
}

describe("B2bCatalogPushService", () => {
  it("ne contacte personne quand aucun produit n’est publié", async () => {
    const { service, sent, bindings } = await build([], []);

    const summary = await service.push(false);

    expect(summary.candidates).toBe(0);
    expect(summary.report).toBeNull();
    expect(sent).toEqual([]);
    expect(bindings.stamped).toEqual([]);
  });

  it("envoie le snapshot et estampille en mode réel", async () => {
    const { service, sent, bindings } = await build(["prd_1"], [product()]);

    const summary = await service.push(false);

    expect(summary.mode).toBe("live");
    expect(sent[0]?.products).toHaveLength(1);
    expect(bindings.stamped).toEqual([["prd_1"]]);
  });

  it("une simulation n’estampille RIEN — sinon l’aperçu mentirait sur l’état", async () => {
    const { service, bindings } = await build(["prd_1"], [product()]);

    const summary = await service.push(true);

    expect(summary.mode).toBe("dry-run");
    expect(summary.report?.acceptedProducts).toBe(1);
    expect(bindings.stamped).toEqual([]);
  });

  /**
   * Le cas qui compte pour l'écran : un produit publié mais écarté par la
   * projection ne doit pas repartir « à jour », sinon rien ne signale qu'il n'est
   * pas en vente.
   */
  it("n’estampille que ce qui est réellement parti, pas les candidats", async () => {
    const priceless = product({
      id: "prd_2",
      sku: "VIE-002",
      variants: [
        {
          id: "var_2",
          sku: "VIE-002-1",
          name: { fr: "Sans prix" },
          options: {},
          isDefault: true,
          isDiscontinued: false,
          position: 0,
          priceCents: null,
          weightGrams: null,
          allergens: null,
          nutrition: null,
        },
      ],
    });
    const { service, bindings } = await build(["prd_1", "prd_2"], [product(), priceless]);

    const summary = await service.push(false);

    expect(summary.candidates).toBe(2);
    expect(bindings.stamped).toEqual([["prd_1"]]);
    expect(summary.excluded).toContainEqual({
      sku: "VIE-002-1",
      reason: "variant_sans_prix",
    });
  });
});
