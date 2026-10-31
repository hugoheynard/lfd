/**
 * E2E de la règle **« une modification ne change jamais un prix convenu en
 * silence »** (`documentation/promotions/plan-remises-acquises.md`, § 10), sur
 * le vrai Postgres, source `promotions`.
 *
 * 1. La faille du § 8.1 : 2 pièces au prix d'une promotion « dans le prix
 *    affiché », puis 50 après sa fin — refusé (409), et le devis le montre
 *    avec ses deux prix au lieu de lever.
 * 2. « −10 % dès 10 » : 10 commandées, puis 1 — refusé, la remise n'est pas
 *    perdue en silence ; le devis la montre.
 * 3. Une promotion de panier ARCHIVÉE depuis reste acquise à une baisse sans
 *    changement de prix — rejouée, jamais rejugée.
 * 4. La passation fige les termes de la remise (`frozen_terms_origin = placed`).
 */
import type {
  AdminPlacedOrderResponse,
  CreatedPickupResponse,
  OrderRevisionQuoteView,
} from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { onlyVariant, posePromotion, promotionTerms } from "./promotion-fixtures.js";

const DAY = serviceDay(7);
const BUYER = "auth0|prix-verrouille";
const SKU = "VIE-001-1";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_lock", clientSecret: "pi_lock_s" }),
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

interface Scene {
  readonly labo: string;
  readonly companyId: string;
  readonly userId: string;
}

/** Un point, un pro actif au compte — puis la bascule vers `promotions`. */
async function scene(): Promise<Scene> {
  const labo = jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .send({
        label: "Le Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  return { labo, companyId: company.id, userId: user.id };
}

function content(pickupId: string, quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: SKU, quantity }],
  };
}

async function place(decor: Scene, quantity: number): Promise<string> {
  return jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId: decor.companyId,
        buyerUserId: decor.userId,
        settlement: "account",
        ...content(decor.labo, quantity),
      })
      .expect(201),
  ).id;
}

async function archive(promotionId: string): Promise<void> {
  await staff()
    .post(`/admin/promotions/${promotionId}/archive`)
    .send({ reason: "Fin de l'opération" })
    .expect(204);
  ctx.app.get(PricingMaterialsCache).invalidate();
}

function revise(orderId: string, body: Record<string, unknown>) {
  return staff()
    .post(`/admin/orders/${orderId}/revisions`)
    .send({ expectedRevision: 0, ...body });
}

async function quote(orderId: string, body: Record<string, unknown>) {
  return jsonBody<OrderRevisionQuoteView>(
    await staff().post(`/admin/orders/${orderId}/revisions/quote`).send(body).expect(200),
  );
}

function frozen(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      revision: true,
      discountCents: true,
      discountPromotionId: true,
      lines: { select: { sku: true, quantity: true, unitPriceMillicents: true } },
    },
  });
}

/** « −10 % au retrait du Labo », pour tous, éventuellement dès un seuil. */
function basketAt(pickupId: string, minQuantity: number | null) {
  return promotionTerms({
    label: { fr: minQuantity === null ? "Remise du Labo" : "Dès 10", en: null, it: null },
    effect: { kind: "percent_off", value: 1_000 },
    validFrom: daysAgo(1),
    fulfillment: { kind: "basket", pickup: { points: [pickupId] }, delivery: "none" },
    conditions: minQuantity === null ? [] : [{ kind: "min_quantity", value: minQuantity }],
  });
}

describe("une modification ne change jamais un prix convenu en silence", () => {
  /**
   * Régression (plan des remises acquises, § 8.1) : une ligne déjà présente
   * gardait son prix figé pour TOUTE quantité — 2 au prix promotionnel, puis
   * 50, et les 50 l'étaient aussi, promotion finie ou non.
   */
  it("2 au prix promotionnel, puis 50 après la fin de la promotion : refusé (409), rien d'écrit", async () => {
    const decor = await scene();
    const promotionId = await posePromotion(staff(), promotionTerms({ scope: onlyVariant(SKU) }));
    ctx.app.get(PricingMaterialsCache).invalidate();
    const orderId = await place(decor, 2);
    const before = await frozen(orderId);
    await archive(promotionId);

    const refused = await revise(orderId, content(decor.labo, 50));

    expect(refused.status).toBe(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("orders.revise.line_price_changed");
    expect(JSON.stringify(refused.body)).toContain("gardez la quantité commandée");
    expect(await frozen(orderId)).toEqual(before);
  });

  it("le devis de révision montre le refus et ses deux prix, sans lever", async () => {
    const decor = await scene();
    const promotionId = await posePromotion(staff(), promotionTerms({ scope: onlyVariant(SKU) }));
    ctx.app.get(PricingMaterialsCache).invalidate();
    const orderId = await place(decor, 2);
    const promoPrice = (await frozen(orderId)).lines[0]?.unitPriceMillicents ?? 0;
    await archive(promotionId);

    const shown = await quote(orderId, content(decor.labo, 50));

    const line = shown.lines[0];
    expect(line).toMatchObject({ sku: SKU, quantity: 50, unitPriceMillicents: promoPrice });
    expect(line?.refusal).toMatchObject({
      kind: "price_changed",
      frozen: { unitPriceMillicents: promoPrice },
    });
    const current = line?.refusal?.kind === "price_changed" ? line.refusal.current : null;
    expect(current?.unitPriceMillicents).toBeGreaterThan(promoPrice);
  });

  it("« dès 10 » : 10 commandées puis 1 — refusé, la remise n'est pas perdue en silence", async () => {
    const decor = await scene();
    await posePromotion(staff(), basketAt(decor.labo, 10));
    ctx.app.get(PricingMaterialsCache).invalidate();
    const orderId = await place(decor, 10);
    const before = await frozen(orderId);
    expect(before.discountCents).toBeGreaterThan(0);

    const shown = await quote(orderId, content(decor.labo, 1));
    const refused = await revise(orderId, content(decor.labo, 1));

    expect(shown.discountRefusals).toEqual([
      expect.objectContaining({ kind: "below_threshold", minQuantity: 10, sku: SKU, quantity: 1 }),
    ]);
    expect(refused.status).toBe(409);
    expect(jsonBody<{ code: string }>(refused).code).toBe("orders.revise.discount_threshold_lost");
    expect(JSON.stringify(refused.body)).toContain("ferait perdre la remise « Dès 10 »");
    expect(await frozen(orderId)).toEqual(before);
  });

  it("la passation fige les termes de la remise de panier", async () => {
    const decor = await scene();
    await posePromotion(staff(), basketAt(decor.labo, 10));
    ctx.app.get(PricingMaterialsCache).invalidate();
    const orderId = await place(decor, 10);

    const discounts = await ctx.prisma.orderDiscount.findMany({
      where: { orderId, archivedAt: null },
    });

    expect(discounts).toEqual([
      expect.objectContaining({
        frozenTermsOrigin: "placed",
        cumulative: false,
        minQuantity: 10,
        fulfillmentPickup: "listed",
        fulfillmentPickupPoints: [decor.labo],
        fulfillmentDelivery: "none",
      }),
    ]);
  });

  it("une promotion de panier archivée depuis reste acquise à une baisse sans changement de prix", async () => {
    const decor = await scene();
    const promotionId = await posePromotion(staff(), basketAt(decor.labo, null));
    ctx.app.get(PricingMaterialsCache).invalidate();
    const orderId = await place(decor, 10);
    await archive(promotionId);

    await revise(orderId, content(decor.labo, 5)).expect(200);

    const after = await frozen(orderId);
    expect(after).toMatchObject({ revision: 1, discountPromotionId: promotionId });
    expect(after.discountCents).toBeGreaterThan(0);
    const active = await ctx.prisma.orderDiscount.findMany({
      where: { orderId, archivedAt: null },
      select: { promotionId: true, frozenTermsOrigin: true, amountCents: true },
    });
    expect(active).toEqual([
      { promotionId, frozenTermsOrigin: "placed", amountCents: after.discountCents },
    ]);
  });
});
