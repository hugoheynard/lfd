/**
 * E2E de la **livraison offerte par une promotion** (plan
 * `documentation/promotions/plan-livraison-offerte.md`, Partie 3, § 2.7 et
 * § 2.8) : une promotion « Sur la livraison » posée par l'écran Promotions
 * pour UNE société offre sa livraison — au devis, à la passation, à la saisie
 * de l'équipe —, et à elle seule ; la commande fige la promotion et son
 * libellé ; une révision rejuge la promotion, et le frais revient quand elle
 * est archivée.
 *
 * Ce que seul le vrai SQL prouve : les CHECK réécrits (B1, B3) admettent la
 * ligne de promotion et la commande offerte, et le mur entre deux sociétés.
 */
import { randomUUID } from "node:crypto";

import type {
  AdminPlacedOrderResponse,
  PlacedOrderResponse,
  PromotionTermsPayload,
  ShopQuoteView,
} from "@lfd/contracts";

import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";
import { INTENT_KEY, freshIntent } from "./intent-key.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

const fakeGateway = cardGatewayDouble("pi_free_delivery_promotion");

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: CardProviders, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const LOYAL_SUB = "auth0|livraison-fidele";
const NEIGHBOUR_SUB = "auth0|livraison-voisine";
const SERVICE_DAY = serviceDay();
const ZONE = {
  label: "Val d'Isère",
  postalPrefixes: ["73150"],
  fee: { mode: "amount", cents: 2_000 },
};
const LINES = [{ sku: "VIE-001-1", quantity: 10 }];
const QUOTE = { lines: LINES, fulfillment: { method: "delivery", codePostal: "73150" } };
const COURIER_ADDR = {
  label: "",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};
const LABEL = { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" };

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

interface SeededPro {
  readonly companyId: string;
  readonly userId: string;
}

/** Un pro actif, au compte, membre de sa société. */
async function seedPro(sub: string): Promise<SeededPro> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub, email: `${randomUUID()}@test.fr` });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  return { companyId: company.id, userId: user.id };
}

async function seedZone(): Promise<void> {
  await staff().post("/admin/delivery-zones").set(INTENT_KEY, freshIntent()).send(ZONE).expect(201);
}

/** « Livraison offerte » pour cette société, toutes zones, toujours (panier minimum 0). */
async function offerDeliveryTo(companyId: string): Promise<string> {
  const terms: PromotionTermsPayload = promotionTerms({
    internalName: "Livraison offerte — client fidèle",
    label: LABEL,
    effect: { kind: "free_delivery", value: 0 },
    audiences: [{ kind: "company", companyId }],
    fulfillment: { kind: "delivery_fee", delivery: "all" },
  });
  const id = await posePromotion(staff(), terms);
  ctx.app.get(PricingMaterialsCache).invalidate();
  return id;
}

async function quoteAs(sub: string): Promise<ShopQuoteView> {
  return jsonBody<ShopQuoteView>(
    await ctx.asSub(sub).post("/shop/quote/mine").send(QUOTE).expect(200),
  );
}

/** Un pro ne livre qu'à une heure INSCRITE sur son adresse. */
async function proAddress(sub: string, companyId: string): Promise<string> {
  const created = await ctx
    .asSub(sub)
    .post(`/companies/${companyId}/delivery-addresses`)
    .set(INTENT_KEY, freshIntent())
    .send({
      ...COURIER_ADDR,
      label: "Hôtel",
      isDefault: true,
      specs: {
        signatureRequired: null,
        note: "",
        slotList: { mode: "everyday", slots: [] },
        deliveryContact: null,
        gps: null,
        windowMode: "deadline",
        deadlines: { mode: "everyday", times: ["10:00"] },
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

function deliveryContent(addressId: string, quantity = 10): Record<string, unknown> {
  return {
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "delivery",
    deliveryAddressId: addressId,
    deliveryAddress: COURIER_ADDR,
    requestedWindow: { start: null, end: "10:00" },
    note: "",
    lines: [{ sku: "VIE-001-1", quantity }],
  };
}

describe("le mur : une promotion d'une société n'offre rien à une autre", () => {
  it("au devis, la société visée voit la livraison offerte et son libellé ; la voisine paie", async () => {
    await seedZone();
    const loyal = await seedPro(LOYAL_SUB);
    await seedPro(NEIGHBOUR_SUB);
    await offerDeliveryTo(loyal.companyId);

    const offered = await quoteAs(LOYAL_SUB);
    expect(offered.deliveryFeeCents).toBe(0);
    expect(offered.freeDelivery).toEqual({ status: "offered", label: LABEL });

    const neighbour = await quoteAs(NEIGHBOUR_SUB);
    expect(neighbour.deliveryFeeCents).toBe(2_000);
    expect(neighbour).not.toHaveProperty("freeDelivery");

    const visitor = jsonBody<ShopQuoteView>(
      await ctx.http().post("/shop/quote").send(QUOTE).expect(200),
    );
    expect(visitor).not.toHaveProperty("freeDelivery");
    expect(JSON.stringify(visitor)).not.toContain(LABEL.fr);
  });
});

describe("la commande offerte par une promotion, de la passation à la révision", () => {
  it("fige la promotion et son libellé, puis rend le frais quand elle est archivée", async () => {
    await seedZone();
    const loyal = await seedPro(LOYAL_SUB);
    const addressId = await proAddress(LOYAL_SUB, loyal.companyId);
    const promotionId = await offerDeliveryTo(loyal.companyId);

    const placed = await ctx
      .asSub(LOYAL_SUB)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        settlement: "account",
        ...deliveryContent(addressId),
      })
      .expect(201);
    const orderId = jsonBody<PlacedOrderResponse>(placed).id;
    expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      deliveryFeeCents: 0,
      deliveryFeeAdjustment: ZONE.fee,
      freeDeliveryThresholdCents: null,
      freeDeliveryWaivedCents: 2_000,
      freeDeliveryPromotionId: promotionId,
      freeDeliveryPromotionThresholdCents: 0,
      freeDeliveryLabel: { fr: LABEL.fr, en: LABEL.fr, it: LABEL.fr },
    });

    await staff()
      .post(`/admin/promotions/${promotionId}/archive`)
      .set(INTENT_KEY, freshIntent())
      .send({ reason: "fin du geste commercial" })
      .expect(201);
    ctx.app.get(PricingMaterialsCache).invalidate();

    await ctx
      .asSub(LOYAL_SUB)
      .post(`/orders/${orderId}/revisions`)
      .send({ expectedRevision: 0, ...deliveryContent(addressId, 12) })
      .expect(200);
    expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({
      deliveryFeeCents: 2_000,
      freeDeliveryWaivedCents: null,
      freeDeliveryPromotionId: null,
      freeDeliveryPromotionThresholdCents: null,
      freeDeliveryLabel: null,
    });
  });
});

describe("la saisie de l'équipe pour le client", () => {
  it("juge la promotion sur les faits du CLIENT, pas de l'agent", async () => {
    await seedZone();
    const loyal = await seedPro(LOYAL_SUB);
    const addressId = await proAddress(LOYAL_SUB, loyal.companyId);
    const promotionId = await offerDeliveryTo(loyal.companyId);

    const placed = jsonBody<AdminPlacedOrderResponse>(
      await staff()
        .post("/admin/orders")
        .set(INTENT_KEY, freshIntent())
        .send({
          companyId: loyal.companyId,
          buyerUserId: loyal.userId,
          settlement: "account",
          ...deliveryContent(addressId),
        })
        .expect(201),
    );

    expect(await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } })).toMatchObject({
      deliveryFeeCents: 0,
      freeDeliveryPromotionId: promotionId,
    });
  });
});

describe("les CHECK de la commande (B3)", () => {
  it("refusent une promotion figée sans son libellé, et un montant offert sans source", async () => {
    await seedZone();
    const loyal = await seedPro(LOYAL_SUB);
    const addressId = await proAddress(LOYAL_SUB, loyal.companyId);
    await offerDeliveryTo(loyal.companyId);
    const placed = await ctx
      .asSub(LOYAL_SUB)
      .post("/orders")
      .send({
        idempotencyKey: randomUUID(),
        salesTerms: null,
        settlement: "account",
        ...deliveryContent(addressId),
      })
      .expect(201);
    const id = jsonBody<PlacedOrderResponse>(placed).id;

    await expect(
      ctx.prisma.$executeRaw`UPDATE public.orders SET free_delivery_label = NULL WHERE id = ${id}`,
    ).rejects.toThrow(/orders_free_delivery_promotion_whole/);
    await expect(
      ctx.prisma.$executeRaw`UPDATE public.orders
         SET free_delivery_promotion_id = NULL, free_delivery_promotion_threshold_cents = NULL,
             free_delivery_label = NULL
       WHERE id = ${id}`,
    ).rejects.toThrow(/orders_free_delivery_together/);
  });
});
