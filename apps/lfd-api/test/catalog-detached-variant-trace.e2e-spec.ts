/**
 * E2E — **la lignée suit la déclinaison copiée, pas le défaut de la fiche née**
 * (`documentation/catalogue/plan-pro-voit-les-declinaisons.md`, « Trace de la
 * déclinaison d'origine », 2026-10-30).
 *
 * Ce que seul ce niveau prouve : qu'un détachement par le référentiel pose la
 * trace sur la déclinaison copiée, que le fil la porte jusqu'au miroir du
 * commerce sur CET article seul, et qu'après l'ajout d'une seconde
 * déclinaison devenue le défaut, les habitudes et les alertes suivent
 * toujours la copie.
 */
import type { CustomerSkuStat } from "@lfd/contracts";

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
async function aBuyingCompany(): Promise<{ companyId: string; userId: string }> {
  const company = await createCompany(ctx.prisma);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|lineage-alerts-buyer" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: user.id };
}

interface BornFiche {
  readonly companyId: string;
  readonly partSku: string;
  readonly copySku: string;
  readonly newDefaultSku: string;
}

/**
 * Une déclinaison commandée trois fois à 4, détachée ; la fiche née reçoit
 * une seconde déclinaison, qui devient son défaut.
 */
async function aBornFicheWithANewDefault(): Promise<BornFiche> {
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
  for (let index = 0; index < HABIT_ORDERS; index += 1) {
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
  const [copy] = (await detailOf(bornId)).variants;
  await priced(bornId, copy?.id ?? "");
  const otherId = jsonBody<{ id: string }>(
    await staff()
      .post(`${PRODUCTS}/${bornId}/variants`)
      .send({ name: { fr: "Ancolie entière" } })
      .expect(201),
  ).id;
  await priced(bornId, otherId);
  await staff().post(`${PRODUCTS}/${bornId}/variants/${otherId}/make-default`).expect(200);
  await staff().put(`${PRODUCTS}/${bornId}/publish`).send({}).expect(200);
  await relayAll(ctx);

  const variants = (await detailOf(bornId)).variants;
  return {
    companyId,
    partSku,
    copySku: variants.find((v) => v.id === copy?.id)?.sku ?? "",
    newDefaultSku: variants.find((v) => v.id === otherId)?.sku ?? "",
  };
}

const HABIT_ORDERS = 3;
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

describe("Trace de la déclinaison d'origine — la lignée suit la copie", () => {
  it("le miroir range la trace sur l'article copié seul", async () => {
    const { partSku, copySku, newDefaultSku } = await aBornFicheWithANewDefault();

    const rows = await ctx.prisma.catalogItem.findMany({
      where: { sku: { in: [copySku, newDefaultSku] } },
      select: { sku: true, isDefault: true, detachedFromVariantSku: true },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        { sku: copySku, isDefault: false, detachedFromVariantSku: partSku },
        { sku: newDefaultSku, isDefault: true, detachedFromVariantSku: null },
      ]),
    );
  });

  it("les habitudes se regroupent sous la copie, pas sous le nouveau défaut", async () => {
    const { companyId, copySku } = await aBornFicheWithANewDefault();

    const habits = jsonBody<CustomerSkuStat[]>(
      await staff().get(`/admin/catalog/companies/${companyId}`).expect(200),
    );

    expect(habits).toEqual([
      expect.objectContaining({
        sku: copySku,
        orderCount: HABIT_ORDERS,
        totalQuantity: HABIT_ORDERS * HABIT_QUANTITY,
      }),
    ]);
  });

  it("les alertes de la copie lisent l'historique de l'ancienne référence", async () => {
    const { companyId, copySku } = await aBornFicheWithANewDefault();

    expect(await kindsFor(companyId, copySku, HABIT_QUANTITY)).toEqual([]);
    expect(await kindsFor(companyId, copySku, DRIFTED_QUANTITY)).toEqual([
      "product.quantity_drift",
    ]);
  });

  it("le nouveau défaut n'hérite pas de l'historique de l'ancienne référence", async () => {
    const { companyId, newDefaultSku } = await aBornFicheWithANewDefault();

    expect(await kindsFor(companyId, newDefaultSku, HABIT_QUANTITY)).toContain(
      "product.first_order",
    );
  });
});
