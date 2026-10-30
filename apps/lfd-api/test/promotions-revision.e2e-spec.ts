/**
 * E2E du **refus de révision qui changerait la promotion** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.8, lot L9), sur le vrai Postgres, source `promotions`.
 *
 * 1. la passation FIGE `orders.discount_promotion_id` ;
 * 2. changer de point quand une promotion de retrait est en jeu est refusé
 *    (409), en nommant le geste de sortie, et rien n'est écrit ;
 * 3. sans promotion ni avant ni après, le changement de point passe ;
 * 4. garder le point garde la promotion ;
 * 5. une commande d'avant L9 (`NULL` = inconnu) est jugée sur sa remise figée.
 *
 * Changement de comportement assumé : jusqu'à L9, la révision recalculait la
 * remise au changement de point, en silence.
 */
import type { AdminPlacedOrderResponse, CreatedPickupResponse } from "@lfd/contracts";

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

const DAY = serviceDay(7);
const BUYER = "auth0|l9-acheteur";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_l9", clientSecret: "pi_l9_secret" }),
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
  readonly boutique: string;
  readonly companyId: string;
  readonly userId: string;
}

async function site(label: string): Promise<string> {
  return jsonBody<CreatedPickupResponse>(
    await staff()
      .post("/admin/pickup-addresses")
      .send({
        label,
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "73150",
        ville: "Val d'Isère",
        pays: "France",
        discounts: { b2b: null, b2c: null },
      })
      .expect(201),
  ).id;
}

/** Deux points, un pro actif au compte — puis la bascule vers `promotions`. */
async function scene(): Promise<Scene> {
  const labo = await site("Le Labo");
  const boutique = await site("La Boutique");
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  ctx.app.get(PricingMaterialsCache).invalidate();
  return { labo, boutique, companyId: company.id, userId: user.id };
}

/** Une promotion de retrait au point donné, pour tous les publics. */
async function poseAt(pickupId: string): Promise<void> {
  await staff()
    .post(`/admin/sites/${pickupId}/promotions`)
    .send({
      internalName: "Retrait au point",
      label: { fr: "Remise retrait", en: null, it: null },
      audienceLabels: { individuals: null, pros: null },
      reason: null,
      effect: { kind: "percent_off", value: 1_000 },
      ownFloor: null,
      stacksOverMercuriale: false,
      validFrom: daysAgo(1),
      validTo: null,
      audiences: [{ kind: "everyone", companyId: null }],
      fulfillment: { kind: "pickup_point", pickupId },
      scope: { mode: "all_except", rules: [] },
      conditions: [],
    })
    .expect(201);
}

function content(pickupId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity: 10 }],
    ...over,
  };
}

async function place(scene: Scene, pickupId: string): Promise<string> {
  return jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId: scene.companyId,
        buyerUserId: scene.userId,
        settlement: "account",
        ...content(pickupId),
      })
      .expect(201),
  ).id;
}

function revise(orderId: string, body: Record<string, unknown>) {
  return staff()
    .post(`/admin/orders/${orderId}/revisions`)
    .send({ expectedRevision: 0, ...body });
}

function frozen(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { revision: true, discountPromotionId: true, discountCents: true },
  });
}

async function promotionAt(pickupId: string): Promise<string> {
  const rows = await ctx.prisma.$queryRawUnsafe<{ id: string }[]>(
    "SELECT id FROM public.promotions WHERE fulfillment_pickup_id = $1",
    pickupId,
  );
  expect(rows).toHaveLength(1);
  return rows[0]?.id ?? "";
}

describe("révision et promotion de retrait (L9)", () => {
  it("la passation fige la promotion panier retenue", async () => {
    const decor = await scene();
    await poseAt(decor.labo);

    const orderId = await place(decor, decor.labo);

    expect(await frozen(orderId)).toMatchObject({
      discountPromotionId: await promotionAt(decor.labo),
    });
  });

  it("refuse le point qui retirerait la promotion, et n'écrit rien", async () => {
    const decor = await scene();
    await poseAt(decor.labo);
    const orderId = await place(decor, decor.labo);
    const before = await frozen(orderId);

    const refused = await revise(orderId, content(decor.boutique)).expect(409);

    expect(JSON.stringify(refused.body)).toContain("annulez la commande et repassez-la");
    expect(await frozen(orderId)).toEqual(before);
  });

  it("accepte un changement de point sans promotion ni avant ni après", async () => {
    const decor = await scene();
    const orderId = await place(decor, decor.labo);

    await revise(orderId, content(decor.boutique)).expect(200);

    expect(await frozen(orderId)).toMatchObject({
      revision: 1,
      discountPromotionId: null,
      discountCents: 0,
    });
  });

  it("garde la promotion quand le point ne change pas", async () => {
    const decor = await scene();
    await poseAt(decor.labo);
    const orderId = await place(decor, decor.labo);
    const promotionId = await promotionAt(decor.labo);

    await revise(
      orderId,
      content(decor.labo, { lines: [{ sku: "VIE-001-1", quantity: 12 }] }),
    ).expect(200);

    const after = await frozen(orderId);
    expect(after).toMatchObject({ revision: 1, discountPromotionId: promotionId });
    expect(after.discountCents).toBeGreaterThan(0);
  });

  it("une commande d'avant L9 (identifiant inconnu) est jugée sur sa remise figée", async () => {
    const decor = await scene();
    await poseAt(decor.labo);
    const orderId = await place(decor, decor.labo);
    // Ce que portent les commandes passées avant L9 : la remise, sans son identifiant.
    await ctx.prisma.order.update({ where: { id: orderId }, data: { discountPromotionId: null } });

    const refused = await revise(orderId, content(decor.boutique)).expect(409);

    expect(JSON.stringify(refused.body)).toContain("retirerait la promotion");
  });
});
