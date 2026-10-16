import type { CatalogSnapshot, SyncOperation } from "@lfd/catalog-sync";
import type { PendingDeliveryView } from "@lfd/contracts";

import { CatalogDelivery } from "../src/b2b/catalog/domain/entities/catalog-delivery.js";
import { CatalogDeliveryRepository } from "../src/b2b/catalog/domain/ports/catalog-delivery.repository.js";
import { snapshotOf } from "./catalog-ingest-fixtures.js";
import { daysAgo, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/**
 * La scène de la BASCULE des opérations au commerce (lot 3 de
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`) :
 * le référentiel, le push et la médiathèque, tels que la migration les lit.
 */

const staff = (ctx: E2eContext) => ctx.asSub(E2E_STAFF_SUB);

/** Une fiche du référentiel et sa déclinaison par défaut, créées par l'API. Rend le SKU. */
export async function pimSku(ctx: E2eContext, nameFr: string): Promise<string> {
  const category = jsonBody<{ id: string }>(
    await staff(ctx)
      .post("/pim/catalogue/categories")
      .send({ name: { fr: `Famille de ${nameFr}` } })
      .expect(201),
  );
  const product = jsonBody<{ id: string }>(
    await staff(ctx)
      .post("/pim/catalogue/products")
      .send({ name: { fr: nameFr }, kind: "made_to_order", categoryId: category.id })
      .expect(201),
  );
  const variant = await ctx.prisma.productVariant.findFirstOrThrow({
    where: { productId: product.id },
    select: { sku: true },
  });
  return variant.sku;
}

/**
 * Un envoi accepté portant ces articles (par leur SKU de déclinaison, tel
 * quel) et ces opérations — le geste de la réception, par HTTP.
 */
let deliveries = 0;
export async function push(
  ctx: E2eContext,
  skus: readonly string[],
  operations: readonly SyncOperation[],
): Promise<void> {
  deliveries += 1;
  const base = snapshotOf(
    skus.map((_, index) => ({ sku: `ART-${String(index)}`, priceMillicents: 210_000 })),
    [],
    operations,
  );
  const snapshot: CatalogSnapshot = {
    ...base,
    products: base.products.map((product, index) => ({
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        sku: skus[index] ?? variant.sku,
      })),
    })),
  };
  await ctx.app.get(CatalogDeliveryRepository).deliver(
    CatalogDelivery.receive({
      id: `d_switch_${String(deliveries)}`,
      revisionId: `rev_switch_${String(deliveries)}`,
      snapshot,
      fingerprint: `empreinte-switch-${String(deliveries)}`,
      receivedAt: new Date(daysAgo(0)),
    }),
  );
  const pending = jsonBody<PendingDeliveryView>(
    await staff(ctx).get("/admin/catalog/delivery").expect(200),
  );
  await staff(ctx)
    .post("/admin/catalog/delivery/accept")
    .send({ deliveryId: pending.id, excludedSkus: [] })
    .expect(201);
}

/** Livre tout ce qui attend dans la boîte d'envoi — faits en cascade compris. */
export async function settle(ctx: E2eContext): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await ctx.drain();
    await ctx
      .http()
      .post("/admin/outbox/sweep")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
  }
}
