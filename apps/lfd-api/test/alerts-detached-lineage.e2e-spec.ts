/**
 * E2E — **les alertes suivent la lignée d'une déclinaison détachée**
 * (`documentation/catalogue/plan-pro-voit-les-declinaisons.md`, L7d-bis).
 *
 * Ce que seul ce niveau prouve : qu'après un détachement par le référentiel,
 * relayé au commerce, l'évaluation d'un panier sous la nouvelle référence lit
 * l'historique passé sous l'ancienne — pas de « jamais commandé » ni d'écart
 * à tort, et l'habitude reste la référence d'un vrai écart.
 */
import { CommandBus } from "@nestjs/cqrs";

import { RecomputeProductNormsCommand } from "../src/b2b/alerts/application/commands/recompute-product-norms.command.js";
import { EvaluateBasket } from "../src/b2b/alerts/application/handlers/evaluate-basket.service.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { anActiveFiche, relayAll, SILENT_TRIGGER } from "./catalog-facts-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, pickupSite, placeOrder } from "./order-factory.js";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

const PRODUCTS = "/pim/catalogue/products";
const PRO_PRICE_HT = "10";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
      { token: PaymentGateway, value: cardGatewayDouble("pi_lineage_alerts") },
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

interface Detail {
  readonly variants: readonly { readonly id: string; readonly sku: string }[];
}

async function detailOf(productId: string): Promise<Detail> {
  return jsonBody<Detail>(await staff().get(`${PRODUCTS}/${productId}`).expect(200));
}

async function priced(productId: string, variantId: string): Promise<void> {
  await staff()
    .put(`${PRODUCTS}/${productId}/variants/${variantId}/pricing`)
    .send({ priceCents: 450, weightGrams: null, proPriceHt: PRO_PRICE_HT })
    .expect(200);
}

async function approveAll(): Promise<void> {
  const skus = (
    await ctx.prisma.catalogItem.findMany({ where: { withdrawnAt: null }, select: { sku: true } })
  ).map((row) => row.sku);
  await staff()
    .post("/admin/catalog/review/approve")
    .send({ skus, audiences: ["pro", "public"] })
    .expect(204);
}

/** Une société au compte, et la personne qui commande pour elle. */
async function aBuyingCompany(
  sub = "auth0|lineage-alerts-buyer",
): Promise<{ companyId: string; userId: string }> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: sub });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: user.id };
}

/** Une fiche à une déclinaison, commandée `orders` fois à 4, puis détachée. */
async function aDetachedHabit(
  orders = HABIT_ORDERS,
): Promise<{ companyId: string; bornSku: string }> {
  const fiche = await anActiveFiche(staff, "Ancolie", "both");
  const partId = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${fiche.id}/variants`)
      .send({ name: { fr: "Ancolie part" } })
      .expect(201),
  ).id;
  await priced(fiche.id, partId);
  const partSku = (await detailOf(fiche.id)).variants.find((v) => v.id === partId)?.sku ?? "";
  await relayAll(ctx);
  await approveAll();

  const { companyId, userId } = await aBuyingCompany();
  const pickupSiteId = await pickupSite(ctx.prisma);
  for (let index = 0; index < orders; index += 1) {
    await placeOrder(ctx, {
      buyerUserId: userId,
      companyId,
      settlement: "account",
      fulfillment: { method: "pickup", pickupSiteId },
      lines: [{ sku: partSku, quantity: HABIT_QUANTITY }],
    });
  }

  const bornId = jsonBody<{ id: string }>(
    await staff().post(`${PRODUCTS}/${fiche.id}/variants/${partId}/detach`).expect(201),
  ).id;
  const [born] = (await detailOf(bornId)).variants;
  await priced(bornId, born?.id ?? "");
  await staff().put(`${PRODUCTS}/${bornId}/publish`).send({}).expect(200);
  await relayAll(ctx);
  const bornSku = (
    await ctx.prisma.catalogItem.findFirstOrThrow({
      where: { productId: bornId, isDefault: true },
      select: { sku: true },
    })
  ).sku;
  return { companyId, bornSku };
}

const HABIT_ORDERS = 3;
/** Le plancher par défaut de `product.quantity_outlier` (`minSampleLines`). */
const NORM_FLOOR_LINES = 20;
const NORM_WINDOW_DAYS = 180;
const OUTLIER_QUANTITY = 40;
const HABIT_QUANTITY = 4;
const DRIFTED_QUANTITY = 12;

async function kindsFor(companyId: string, sku: string, quantity: number): Promise<string[]> {
  const evaluation = await ctx.app.get(EvaluateBasket).evaluate({
    companyId,
    lines: [{ sku, productName: sku, quantity }],
    evaluatedOrder: null,
    now: new Date(),
  });
  return evaluation.drafts.map((draft) => draft.kind);
}

describe("L7d-bis — les alertes suivent la lignée d'une déclinaison détachée", () => {
  it("la quantité habituelle sous la nouvelle référence ne déclenche rien", async () => {
    const { companyId, bornSku } = await aDetachedHabit();

    expect(await kindsFor(companyId, bornSku, HABIT_QUANTITY)).toEqual([]);
  });

  it("l'habitude passée sous l'ancienne référence mesure un vrai écart", async () => {
    const { companyId, bornSku } = await aDetachedHabit();

    expect(await kindsFor(companyId, bornSku, DRIFTED_QUANTITY)).toEqual([
      "product.quantity_drift",
    ]);
  });
});

describe("la norme catalogue suit la lignée (2026-10-30)", () => {
  /**
   * Avant : la norme se lisait par SKU seul, et une référence née n'en avait
   * pas tant que ses propres lignes manquaient — l'aberration se taisait.
   */
  it("une référence née d'une ancienne à norme établie crie l'aberration dès sa première commande", async () => {
    const { bornSku } = await aDetachedHabit(NORM_FLOOR_LINES);
    await ctx.app.get(CommandBus).execute(new RecomputeProductNormsCommand(NORM_WINDOW_DAYS));
    const newcomer = await aBuyingCompany("auth0|lineage-alerts-newcomer");

    expect(await kindsFor(newcomer.companyId, bornSku, OUTLIER_QUANTITY)).toContain(
      "product.quantity_outlier",
    );
    expect(await kindsFor(newcomer.companyId, bornSku, HABIT_QUANTITY)).not.toContain(
      "product.quantity_outlier",
    );
  });
});
