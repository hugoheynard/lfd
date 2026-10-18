import type { CatalogSnapshot, SyncCategory, SyncProduct } from "@lfd/catalog-sync";

import { CatalogCategoryChangedFact } from "../src/pim/channels/b2b-platform/products/catalog-category-changed.fact.js";
import type {
  CatalogFamilyFactBody,
  CatalogProductFactBody,
} from "../src/pim/channels/b2b-platform/products/catalog-facts.js";
import { CatalogProductChangedFact } from "../src/pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import { CatalogRulesChangedFact } from "../src/pim/channels/b2b-platform/products/catalog-rules-changed.fact.js";
import { CommandBus } from "@nestjs/cqrs";

import { ApproveReviewCommand } from "../src/b2b/catalog/application/commands/approve-review.command.js";
import { CatalogItemRepository } from "../src/b2b/catalog/domain/ports/catalog-item.repository.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import type { DurableFact } from "../src/platform/outbox/durable-event.js";
import { relayAll } from "./catalog-facts-scene.js";
import type { E2eContext } from "./e2e-harness.js";

/**
 * **Un instantané du référentiel, livré EN FAITS** — ce que le commerce reçoit
 * depuis X1 (2026-10-17, `documentation/catalogue/catalogue-synchronise.md` §6),
 * où l'ingestion d'un push n'écrit plus rien.
 *
 * Les suites qui semaient leur catalogue par un push gardent leurs fixtures
 * (`snapshotOf`) : chaque famille part en `pim.catalog_category_changed`,
 * chaque fiche en `pim.catalog_product_changed` (ACTIVE, aux deux clientèles,
 * complète), l'échelle des limites en `pim.catalog_rules_changed`, sous des
 * numéros croissants — puis la boîte d'envoi les livre aux VRAIS abonnés.
 *
 * Ce que le push faisait et qu'un fait ne fait pas, rendu explicite :
 * - une fiche livrée avant et absente de cet instantané part en fait
 *   « archivée » — le retrait que le push déduisait d'une absence ;
 * - les opérations datées ne voyagent pas : elles s'écrivent au commerce
 *   (`/admin/operations`) ;
 * - un article arrivé par un fait attend sa RELECTURE avant d'être servi
 *   (`catalog-public-review.e2e-spec.ts`) ; le push le servait d'emblée. Le
 *   geste du staff est donc rejoué ici, pour les deux clientèles — sauf
 *   `{ reviewed: false }`, quand la relecture est le sujet.
 */

/** Les numéros ne servent qu'à ordonner : croissants pour tout le processus. */
let seq = 1_000;

/** Les fiches déjà livrées, par contexte — ce que l'absence retire. */
const delivered = new WeakMap<E2eContext, Map<string, CatalogProductFactBody>>();

export interface FactsDelivery {
  /** L'instant d'émission ; par défaut, celui de l'instantané. */
  readonly emittedAt?: string;
  /** `false` : laisser les articles arrivés en attente de relecture. */
  readonly reviewed?: boolean;
  /**
   * Par défaut, l'instantané est TOUT le catalogue — les articles que le
   * commerce tenait hors de lui (le semis du harnais) sont retirés de la
   * vente, par l'agrégat, comme le push les retirait. `false` les laisse.
   */
  readonly alone?: boolean;
}

/**
 * Livre l'instantané en faits, et attend que la boîte d'envoi soit vide.
 *
 * @throws {RangeError} une livraison a échoué (cf. `relayAll`).
 */
export async function deliverAsFacts(
  ctx: E2eContext,
  snapshot: CatalogSnapshot,
  options: FactsDelivery = {},
): Promise<void> {
  const emittedAt = options.emittedAt ?? snapshot.generatedAt;
  const families = new Map(snapshot.categories.map((category) => [category.id, category]));
  const facts: DurableFact[] = snapshot.categories.map((category) =>
    new CatalogCategoryChangedFact(
      category.id,
      next(),
      emittedAt,
      familyOf(category),
    ).durableFact(),
  );
  const known = delivered.get(ctx) ?? new Map<string, CatalogProductFactBody>();
  const arriving = new Map(
    snapshot.products.map((product) => [product.id, productBody(product, families)]),
  );
  for (const [id, body] of arriving) {
    facts.push(new CatalogProductChangedFact(id, next(), emittedAt, body).durableFact());
  }
  // Seules celles que le commerce tient encore : `ctx.reset()` vide la base
  // sans prévenir cette mémoire.
  const held = new Set(
    (
      await ctx.prisma.catalogEntry.findMany({
        where: { productId: { in: [...known.keys()] }, status: { not: "archived" } },
        select: { productId: true },
      })
    ).map((row) => row.productId),
  );
  for (const [id, body] of known) {
    if (!arriving.has(id) && held.has(id)) {
      const archived: CatalogProductFactBody = { ...body, status: "archived" };
      arriving.set(id, archived);
      facts.push(new CatalogProductChangedFact(id, next(), emittedAt, archived).durableFact());
    }
  }
  facts.push(
    new CatalogRulesChangedFact(next(), emittedAt, snapshot.orderTimeLimits).durableFact(),
  );
  delivered.set(ctx, new Map([...known, ...arriving]));
  await publish(ctx, facts);
  if (options.alone !== false) {
    await withdrawOthers(ctx, snapshot, new Date(emittedAt));
  }
  if (options.reviewed !== false) {
    await approveArrived(ctx, snapshot);
  }
}

/** Retire de la vente, par l'agrégat, ce que l'instantané ne porte pas. */
async function withdrawOthers(ctx: E2eContext, snapshot: CatalogSnapshot, at: Date): Promise<void> {
  const products = new Set(snapshot.products.map((product) => product.id));
  const items = ctx.app.get(CatalogItemRepository);
  const others = (await items.loadAll()).filter((item) => !products.has(item.productId));
  for (const item of others) {
    item.withdraw(at);
  }
  await items.saveMany(others);
}

/** Le geste « valider » du staff, pour les articles de l'instantané encore en attente. */
async function approveArrived(ctx: E2eContext, snapshot: CatalogSnapshot): Promise<void> {
  const skus = snapshot.products.flatMap((product) => product.variants.map((v) => v.sku));
  const pending = await ctx.prisma.catalogItem.findMany({
    where: {
      sku: { in: skus },
      OR: [{ publicReviewPending: true }, { proReviewPending: true }],
    },
    select: { sku: true },
  });
  if (pending.length > 0) {
    await ctx.app.get(CommandBus).execute(
      new ApproveReviewCommand(
        pending.map((row) => row.sku),
        ["pro", "public"],
      ),
    );
  }
}

async function publish(ctx: E2eContext, facts: readonly DurableFact[]): Promise<void> {
  const durable = ctx.app.get(DurablePublisher);
  await ctx.app.get(UnitOfWork).run(async () => {
    for (const fact of facts) {
      await durable.publish(fact);
    }
  });
  await relayAll(ctx);
}

function next(): number {
  seq += 1;
  return seq;
}

function familyOf(category: SyncCategory): CatalogFamilyFactBody {
  return { ...category, audience: "both", archived: false };
}

/** Le corps du fait d'une fiche ACTIVE, aux deux clientèles, complète. */
export function productBody(
  product: SyncProduct,
  families: ReadonlyMap<string, SyncCategory>,
): CatalogProductFactBody {
  const { variants, ...head } = product;
  const family = families.get(product.categoryId);
  if (family === undefined) {
    throw new RangeError(`la fiche ${product.id} vise une famille absente de l'instantané`);
  }
  return {
    status: "active",
    audience: "both",
    audienceInherited: true,
    product: head,
    variants,
    gaps: {},
    family: familyOf(family),
  };
}
