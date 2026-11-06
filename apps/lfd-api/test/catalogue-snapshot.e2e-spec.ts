/**
 * **L'instantané du catalogue : l'invalidation et le mur** — lot M1b du plan
 * `documentation/caching-usage/plan-materiaux-du-catalogue.md` (§ 3).
 *
 * Le devis lit le catalogue dans une mémoire rangée sous les numéros de
 * `context_versions`. Ce qui est éprouvé ici traverse le vrai SQL — les
 * déclencheurs, le filtre des réservations par société, la passation qui
 * relit la base :
 *
 * - une fiche modifiée entre deux devis change le second, qu'elle passe par
 *   le client de l'API ou par une écriture SQL brute (le déclencheur) ;
 * - un article retiré est refusé pareil, mémoire froide ou chaude ;
 * - un pro ne voit pas l'article réservé à une autre société ;
 * - un devis suivi d'une réservation par une autre société : la passation
 *   refuse, sans écrire ;
 * - un article sans taux est absent des lectures du catalogue entier ;
 * - la remise du harnais vide la mémoire.
 */
import { randomUUID } from "node:crypto";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CatalogueSnapshotStore } from "../src/b2b/catalog/infrastructure/catalogue-snapshot/catalogue-snapshot.store.js";
import { Clock } from "../src/platform/time/clock.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, type E2eContext } from "./e2e-harness.js";
import { agentsFor, contentOf, shopQuoteBody } from "./pricing-golden-master-bodies.js";
import type { GoldenBasket } from "./pricing-golden-master-corpus.js";
import {
  BUYER_SUB,
  GOLDEN_CLOCK,
  NO_CREDIT_SUB,
  seedGoldenScene,
  type GoldenScene,
} from "./pricing-golden-master-scene.js";

const CROISSANT = "VIE-001-1";
const PAIN = "PAI-001-1";

/** Un numéro hors de portée des semis : la mémoire y est rangée à la main. */
const PARKED_VERSION = 9_000_000n;

const BASKET: GoldenBasket = {
  key: "catalogue-snapshot",
  lines: [
    { sku: CROISSANT, quantity: 3 },
    { sku: PAIN, quantity: 2 },
  ],
  fulfillment: "pickup",
  deliveryVat: "standard",
  promotions: [],
  voucherSteps: 0,
  clientRevision: [],
  staffRevision: [],
};

const fakeGateway = {
  createIntent: () =>
    Promise.resolve({ paymentIntentId: `pi_${randomUUID()}`, clientSecret: "pi_secret" }),
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_catalogue_snapshot",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;
let scene: GoldenScene;
let ipSeq = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: Clock, value: GOLDEN_CLOCK },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
}, 120_000);

beforeEach(async () => {
  await ctx.reset();
  scene = await seedGoldenScene(ctx);
}, 120_000);

afterAll(async () => {
  await ctx.close();
});

/** Une adresse cliente par appel : le limiteur compte par adresse. */
function agents() {
  ipSeq += 1;
  return agentsFor(ctx, `198.51.100.${String(10 + (ipSeq % 200))}`);
}

/** Le devis du pro de la scène (ou d'un autre), sur ce panier. */
function quoteAs(sub: string, companyId: string, basket: GoldenBasket = BASKET) {
  return agents().as(sub, companyId).post("/shop/quote/mine").send(shopQuoteBody(scene, basket));
}

async function subtotalOf(sub: string, companyId: string): Promise<number> {
  const response = await quoteAs(sub, companyId);
  expect(response.status).toBe(200);
  return (response.body as { subtotalHtCents: number }).subtotalHtCents;
}

/** Le panier réduit à un seul article. */
function only(sku: string): GoldenBasket {
  return { ...BASKET, lines: [{ sku, quantity: 2 }] };
}

function reserve(sku: string, companyId: string) {
  return agents().as(E2E_STAFF_SUB).put(`/admin/catalog/${sku}/reservations/${companyId}`);
}

async function catalogVersion(): Promise<bigint> {
  const row = await ctx.prisma.contextVersion.findUniqueOrThrow({ where: { context: "catalog" } });
  return row.value;
}

describe("l'instantané — l'invalidation par les numéros", () => {
  it("une fiche modifiée entre deux devis change le second", async () => {
    const before = await subtotalOf(BUYER_SUB, scene.pro.companyId);
    // Le second devis à chaud : la mémoire tient le catalogue.
    expect(await subtotalOf(BUYER_SUB, scene.pro.companyId)).toBe(before);
    const item = await ctx.prisma.catalogItem.findUniqueOrThrow({ where: { sku: CROISSANT } });
    await ctx.prisma.catalogItem.update({
      where: { sku: CROISSANT },
      data: { priceMillicents: (item.priceMillicents ?? 0) + 100_000 },
    });

    expect(await subtotalOf(BUYER_SUB, scene.pro.companyId)).toBeGreaterThan(before);
  });

  it("une écriture SQL brute aussi : le déclencheur fait monter le numéro", async () => {
    const before = await subtotalOf(BUYER_SUB, scene.pro.companyId);
    const version = await catalogVersion();
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE "public"."catalog_items" SET "price_millicents" = "price_millicents" + 100000 WHERE "sku" = '${CROISSANT}'`,
    );

    expect(await catalogVersion()).toBeGreaterThan(version);
    expect(await subtotalOf(BUYER_SUB, scene.pro.companyId)).toBeGreaterThan(before);
  });

  it("un article retiré dans le panier est refusé pareil, mémoire froide ou chaude", async () => {
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE "public"."catalog_items" SET "withdrawn_at" = now() WHERE "sku" = '${PAIN}'`,
    );
    ctx.app.get(CatalogueSnapshotStore).forget();
    const cold = await quoteAs(BUYER_SUB, scene.pro.companyId, only(PAIN));
    const warm = await quoteAs(BUYER_SUB, scene.pro.companyId, only(PAIN));

    expect(cold.status).toBeGreaterThanOrEqual(400);
    expect(warm.status).toBe(cold.status);
    expect(warm.body).toMatchObject({ code: (cold.body as { code: string }).code });
  });
});

describe("l'instantané — le mur entre sociétés", () => {
  it("un pro ne voit pas l'article réservé à une autre société ; elle, si", async () => {
    // La mémoire chauffée AVANT la réservation : le numéro doit la défaire.
    await subtotalOf(BUYER_SUB, scene.pro.companyId);
    await reserve(CROISSANT, scene.proWithoutCredit.companyId).expect(204);

    const other = await quoteAs(BUYER_SUB, scene.pro.companyId, only(CROISSANT));
    expect(other.status).toBeGreaterThanOrEqual(400);
    const holder = await quoteAs(NO_CREDIT_SUB, scene.proWithoutCredit.companyId, only(CROISSANT));
    expect(holder.status).toBe(200);
  });

  it("devis, réservation par une autre société, passation refusée — sans commande écrite", async () => {
    const quoted = await quoteAs(BUYER_SUB, scene.pro.companyId);
    expect(quoted.status).toBe(200);
    const { totalCents } = quoted.body as { totalCents: number };
    await reserve(PAIN, scene.proWithoutCredit.companyId).expect(204);
    const ordersBefore = await ctx.prisma.order.count();

    const placed = await agents()
      .as(BUYER_SUB, scene.pro.companyId)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        settlement: "account",
        expectedTotalCents: totalCents,
        ...contentOf(scene, BASKET, "pro"),
      });

    expect(placed.status).toBeGreaterThanOrEqual(400);
    expect(placed.status).toBeLessThan(500);
    expect(await ctx.prisma.order.count()).toBe(ordersBefore);
  });
});

describe("l'instantané — ce que les lectures du catalogue entier réappliquent", () => {
  it("un article sans taux est absent des choix de l'éditeur des suggestions", async () => {
    const choices = () => agents().as(E2E_STAFF_SUB).get("/admin/suggestions/choices");
    const skusOf = (body: unknown) =>
      (body as { articles: { sku: string }[] }).articles.map((entry) => entry.sku);
    const before = await choices().expect(200);
    expect(skusOf(before.body)).toContain(CROISSANT);
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE "public"."catalog_items" SET "vat_rate_percent" = NULL WHERE "sku" = '${CROISSANT}'`,
    );

    const after = await choices().expect(200);
    expect(skusOf(after.body)).not.toContain(CROISSANT);
  });
});

describe("l'instantané — la remise du harnais", () => {
  /**
   * Le danger que `forget()` ferme : la remise ramène les numéros en arrière,
   * et un morceau gardé sous un numéro qui revient serait resservi. On range
   * la mémoire sous un numéro posé à la main, on remet, on écrit, et on
   * reprend le même numéro.
   */
  it("un morceau gardé sous un numéro qui revient après ctx.reset() n'est pas resservi", async () => {
    await ctx.prisma.contextVersion.update({
      where: { context: "catalog" },
      data: { value: PARKED_VERSION },
    });
    const parked = await subtotalOf(BUYER_SUB, scene.pro.companyId);

    await ctx.reset();
    scene = await seedGoldenScene(ctx);
    await ctx.prisma.$executeRawUnsafe(
      `UPDATE "public"."catalog_items" SET "price_millicents" = "price_millicents" + 100000 WHERE "sku" = '${CROISSANT}'`,
    );
    await ctx.prisma.contextVersion.update({
      where: { context: "catalog" },
      data: { value: PARKED_VERSION },
    });

    expect(await subtotalOf(BUYER_SUB, scene.pro.companyId)).toBeGreaterThan(parked);
  });
});
