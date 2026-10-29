/**
 * E2E — **changer l'unité de vente d'une déclinaison publiée**
 * (`documentation/pricing/plan-changer-l-unite-de-vente.md`, § 8, Hugo,
 * 2026-10-29).
 *
 * Ce que seul ce niveau prouve : le référentiel interroge le commerce par le
 * port que `appBootstrap/` relie, sur la vraie base. Jamais commandée, la
 * déclinaison passe au poids et le miroir la sert au poids ; commandée, le
 * changement est refusé en 409 en disant où et le geste de sortie ; et un
 * panier composé à la pièce perd la ligne au devis, avec son motif, au lieu
 * que tout le décompte tombe.
 */
import type { ShopQuoteView } from "@lfd/contracts";
import type { ProductSaleUnitUsageView } from "@lfd/pim-contracts";
import request from "supertest";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER, type Fiche } from "./catalog-facts-scene.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { cardGatewayDouble, pickupSite, placeOrder } from "./order-factory.js";

const PRODUCTS = "/pim/catalogue/products";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
      { token: PaymentGateway, value: cardGatewayDouble("pi_unit") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["http"]> => ctx.asSub(E2E_STAFF_SUB);

async function defaultVariantId(fiche: Fiche): Promise<string> {
  const detail = jsonBody<{ variants: { id: string; isDefault: boolean }[] }>(
    await staff().get(`${PRODUCTS}/${fiche.id}`).expect(200),
  );
  return detail.variants.find((variant) => variant.isDefault)?.id ?? "";
}

function toWeight(fiche: Fiche, variantId: string) {
  return staff()
    .put(`${PRODUCTS}/${fiche.id}/variants/${variantId}/pricing`)
    .send({ priceCents: 2_400, weightGrams: null, saleUnit: "weight", weightStepGrams: 100 });
}

async function usageOf(fiche: Fiche): Promise<ProductSaleUnitUsageView> {
  return jsonBody<ProductSaleUnitUsageView>(
    await staff().get(`${PRODUCTS}/${fiche.id}/sale-unit-usage`).expect(200),
  );
}

/** La revue du catalogue : un article reçu ne se vend qu'approuvé. */
async function publishAll(): Promise<void> {
  await relayAll(ctx);
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

function mirroredUnit(fiche: Fiche) {
  return ctx.prisma.catalogItem.findUnique({
    where: { sku: fiche.variantSku },
    select: { saleUnit: true },
  });
}

describe("changer l'unité de vente d'une déclinaison publiée", () => {
  it("jamais commandée : le changement passe, et le commerce la sert au poids", async () => {
    const fiche = await anActiveFiche(staff, "Graines au chocolat", "both");
    await relayAll(ctx);
    const variantId = await defaultVariantId(fiche);
    expect((await usageOf(fiche)).variants).toEqual([
      { variantId, verified: true, uses: [], labels: [] },
    ]);

    await toWeight(fiche, variantId).expect(200);
    await relayAll(ctx);

    expect(await mirroredUnit(fiche)).toEqual({ saleUnit: "weight" });
  });

  it("déjà commandée : 409 qui dit où et le geste de sortie, et rien ne bouge", async () => {
    const fiche = await anActiveFiche(staff, "Pain de seigle", "both");
    await publishAll();
    const buyer = await createUser(ctx.prisma, { auth0Sub: "auth0|unit-buyer" });
    await placeOrder(ctx, {
      buyerUserId: buyer.id,
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
      // Le défaut se vend sous le SKU de sa fiche.
      lines: [{ sku: fiche.sku, quantity: 2 }],
    });
    const variantId = await defaultVariantId(fiche);
    expect((await usageOf(fiche)).variants).toEqual([
      { variantId, verified: true, uses: ["order"], labels: ["déjà commandée"] },
    ]);

    const refus = await toWeight(fiche, variantId).expect(409);

    expect(jsonBody<{ code: string }>(refus).code).toBe("catalogue.variant.sale_unit_in_use");
    expect(jsonBody<{ message: string }>(refus).message).toContain("déjà commandée");
    expect(jsonBody<{ message: string }>(refus).message).toContain(
      "Créez une autre déclinaison pour la vendre autrement",
    );
    await relayAll(ctx);
    expect(await mirroredUnit(fiche)).toEqual({ saleUnit: "piece" });
  });

  it("un panier composé à la pièce perd la ligne au devis, avec son motif, et le reste se chiffre", async () => {
    const fiche = await anActiveFiche(staff, "Graines de courge", "both");
    await publishAll();
    await toWeight(fiche, await defaultVariantId(fiche)).expect(200);
    await publishAll();

    const quote = jsonBody<ShopQuoteView>(
      await request(ctx.app.getHttpServer())
        .post("/shop/quote")
        .send({
          lines: [
            { sku: fiche.sku, quantity: 3 },
            { sku: "VIE-001", quantity: 2 },
          ],
          fulfillment: null,
        })
        .expect(200),
    );

    expect(quote.lines.map((line) => line.sku)).toEqual(["VIE-001"]);
    expect(quote.removedLines).toHaveLength(1);
    expect(quote.removedLines?.[0]).toMatchObject({
      sku: fiche.sku,
      reason: "sale_unit_changed",
      saleUnit: "weight",
    });
    expect(quote.removedLines?.[0]?.name).not.toBe("");
  });
});
