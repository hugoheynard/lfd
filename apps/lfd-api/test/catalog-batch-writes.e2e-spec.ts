/**
 * E2E — **les gestes de lot du catalogue ne croissent pas avec le lot**.
 *
 * Régression : le 2026-10-17, « Tout valider » sur 64 articles a fait expirer
 * la transaction interactive en production (P2028) — une requête par article.
 * Les autres écritures de lot du miroir avaient la même forme : l'upsert des
 * agrégats (`saveMany`), la mise en vente des déclinaisons d'une fiche
 * (`putOnSale`) et la descente des limites de commande sur tout le catalogue.
 *
 * ⚠️ Le Postgres local répond trop vite pour reproduire l'expiration. Ce qui
 * se prouve ici, contre le vrai SQL, c'est le NOMBRE d'opérations (compteur
 * branché sur le client, `SchemaOpsCounter`) : le même pour 3 articles et
 * pour 70 — et que le lot de 70 est écrit en entier.
 */
import {
  CATALOG_SNAPSHOT_VERSION,
  type CatalogSnapshot,
  type SyncProduct,
} from "@lfd/catalog-sync";

import { CatalogItemRepository } from "../src/b2b/catalog/domain/ports/catalog-item.repository.js";
import { SchemaOpsCounter } from "../src/platform/database/schema-ops.counter.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { CatalogProductChangedFact } from "../src/pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import { CatalogRulesChangedFact } from "../src/pim/channels/b2b-platform/products/catalog-rules-changed.fact.js";
import type { DurableFact } from "../src/platform/outbox/durable-event.js";
import { deliverAsFacts, productBody } from "./catalog-facts-delivery.js";
import { relayAll, SILENT_TRIGGER } from "./catalog-facts-scene.js";
import { bootstrapE2e, daysAgo, E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";

const FEW = 3;
const MANY = 70;
const FAMILY = "fam-lot";
/** Sans rattrapage : une limite de produit n'en a plus (2026-10-21). */
const PRODUCT_LIMIT = { daysBefore: 1, time: "18:00", graceMinutes: null };

let ctx: E2eContext;
let counter: SchemaOpsCounter;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: OutboxRelayTrigger, value: SILENT_TRIGGER }] });
  counter = ctx.app.get(SchemaOpsCounter);
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

/** Les opérations ORM que coûte `run`, travail de fond compris. */
async function operationsOf(run: () => Promise<unknown>): Promise<number> {
  await ctx.drain();
  const before = counter.total();
  await run();
  await ctx.drain();
  return counter.total() - before;
}

function variantsOf(productIndex: number, count: number): SyncProduct["variants"] {
  return Array.from({ length: count }, (_, index) => ({
    id: `var_lot_${String(productIndex)}_${String(index)}`,
    sku: `LOT-${String(productIndex)}-${String(index + 1)}`,
    name: `Article ${String(productIndex)}.${String(index)}`,
    priceMillicents: 100_000 + index,
    weightGrams: null,
    isDefault: index === 0,
    position: index,
    vatRatePercent: 5.5,
    publicTtcCents: 250,
    publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 236_967 } },
    allergens: ["UW"],
    allergenLabels: null,
  }));
}

function productOf(index: number, variantCount: number): SyncProduct {
  return {
    id: `prd_lot_${String(index)}`,
    sku: `LOT-${String(index)}`,
    name: `Fiche ${String(index)}`,
    categoryId: FAMILY,
    kind: "daily",
    variants: variantsOf(index, variantCount),
    note: null,
    image: null,
    thumbnail: null,
    operationOnly: false,
    requiresCold: false,
  };
}

function snapshotOf(products: readonly SyncProduct[]): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: daysAgo(1),
    categories: [
      { id: FAMILY, name: "Lot", slug: "lot", parentId: null, position: 0, vatRatePercent: 5.5 },
    ],
    products: [...products],
    orderTimeLimits: [],
    operations: [],
  };
}

/** `count` fiches d'une déclinaison chacune. */
const catalogueOf = (count: number) =>
  snapshotOf(Array.from({ length: count }, (_, index) => productOf(index, 1)));

const ALONE = { alone: false, reviewed: false } as const;

/** Les numéros ne servent qu'à ordonner : au-delà de ceux de `deliverAsFacts`. */
let seq = 9_000_000;

/** Publie UN fait et le livre — la seule livraison mesurée. */
async function deliver(fact: DurableFact): Promise<void> {
  await ctx.app.get(UnitOfWork).run(() => ctx.app.get(DurablePublisher).publish(fact));
  await relayAll(ctx);
}

describe("la mise en vente des déclinaisons d'une fiche", () => {
  /** La fiche seule : sa famille et l'échelle des limites sont déjà reçues. */
  async function operationsOfFiche(variantCount: number): Promise<number> {
    await ctx.reset();
    const empty = snapshotOf([]);
    await deliverAsFacts(ctx, empty, ALONE);
    const product = productOf(0, variantCount);
    const family = new Map(empty.categories.map((category) => [category.id, category]));
    seq += 1;
    const fact = new CatalogProductChangedFact(
      product.id,
      seq,
      daysAgo(0),
      productBody(product, family),
    );
    return operationsOf(() => deliver(fact.durableFact()));
  }

  // P2028 (2026-10-17) : un upsert par déclinaison dans la transaction de la livraison.
  it(`coûte autant pour ${String(FEW)} déclinaisons que pour ${String(MANY)}`, async () => {
    const few = await operationsOfFiche(FEW);
    const many = await operationsOfFiche(MANY);

    expect(many).toBe(few);
    const written = await ctx.prisma.catalogItem.findMany({
      where: { productId: "prd_lot_0", withdrawnAt: null },
      select: { publicReviewPending: true, allergens: true, variantId: true },
    });
    expect(written).toHaveLength(MANY);
    expect(written.every((row) => row.publicReviewPending && row.variantId !== null)).toBe(true);
    expect(written[0]?.allergens).toEqual(["UW"]);
    // La trace du tarif, une ligne par article neuf, dans la même livraison.
    expect(await ctx.prisma.catalogPriceHistory.count({ where: { productSku: "LOT-0" } })).toBe(
      MANY,
    );
  });
});

describe("l'enregistrement d'agrégats en lot (saveMany)", () => {
  /** Les articles du lot — pas ceux que le harnais sème. */
  async function lotItems() {
    const all = await ctx.app.get(CatalogItemRepository).loadAll();
    return all.filter((item) => item.productId.startsWith("prd_lot_"));
  }

  // P2028 (2026-10-17) : un upsert et une décision par article dans la même transaction.
  it(`coûte autant pour ${String(FEW)} articles que pour ${String(MANY)}`, async () => {
    await deliverAsFacts(ctx, catalogueOf(MANY), ALONE);
    const repository = ctx.app.get(CatalogItemRepository);
    const items = await lotItems();
    expect(items).toHaveLength(MANY);
    const tracedBefore = await ctx.prisma.catalogPriceHistory.count();
    for (const item of items) {
      item.hide(E2E_STAFF_ID);
    }

    const few = await operationsOf(() => repository.saveMany(items.slice(0, FEW)));
    const many = await operationsOf(() => repository.saveMany(items));

    expect(many).toBe(few);
    expect(
      await ctx.prisma.catalogItemOverride.count({
        where: { isHidden: true, sku: { startsWith: "LOT-" } },
      }),
    ).toBe(MANY);
    // Prix inchangé ⇒ aucune ligne d'historique.
    expect(await ctx.prisma.catalogPriceHistory.count()).toBe(tracedBefore);
  });

  it("remet les drapeaux à faux sans supprimer la ligne quand plus rien n'est décidé", async () => {
    await deliverAsFacts(ctx, catalogueOf(MANY), ALONE);
    const repository = ctx.app.get(CatalogItemRepository);
    const hidden = await lotItems();
    hidden.forEach((item) => item.hide(E2E_STAFF_ID));
    await repository.saveMany(hidden);

    const shown = await lotItems();
    shown.forEach((item) => item.show(E2E_STAFF_ID));
    await ctx.app.get(UnitOfWork).run(() => repository.saveMany(shown));

    const lot = { sku: { startsWith: "LOT-" } };
    expect(await ctx.prisma.catalogItemOverride.count({ where: lot })).toBe(MANY);
    expect(await ctx.prisma.catalogItemOverride.count({ where: { ...lot, isHidden: true } })).toBe(
      0,
    );
  });
});

describe("la descente des limites de commande sur tout le catalogue", () => {
  /**
   * Une limite sur CHAQUE produit : depuis le 2026-10-21, le référentiel n'a
   * plus de rang global, et c'est la seule façon de toucher tout le catalogue.
   */
  function deliverLimitsOn(count: number): () => Promise<void> {
    return async () => {
      seq += 1;
      const rules = Array.from({ length: count }, (_, index) => ({
        scope: { type: "product" as const, id: `prd_lot_${String(index)}` },
        ...PRODUCT_LIMIT,
      }));
      await deliver(new CatalogRulesChangedFact(seq, daysAgo(0), rules).durableFact());
    };
  }

  // P2028 (2026-10-17) : une écriture par article en vente dans la transaction de la livraison.
  it(`coûte autant pour ${String(FEW)} articles que pour ${String(MANY)}`, async () => {
    await deliverAsFacts(ctx, catalogueOf(FEW), ALONE);
    const few = await operationsOf(deliverLimitsOn(FEW));
    await ctx.reset();
    await deliverAsFacts(ctx, catalogueOf(MANY), ALONE);
    const many = await operationsOf(deliverLimitsOn(MANY));

    expect(many).toBe(few);
    expect(
      await ctx.prisma.catalogItem.count({
        where: {
          sku: { startsWith: "LOT-" },
          orderLimitDaysBefore: PRODUCT_LIMIT.daysBefore,
          orderLimitTime: PRODUCT_LIMIT.time,
          orderLimitGraceMinutes: 0,
        },
      }),
    ).toBe(MANY);
  });
});
