/**
 * E2E de la **transformation d'un reliquat en commande** (lot B3, plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 4), sur
 * le vrai Postgres : le prix d'origine après une hausse du catalogue, la
 * remise en pourcentage rejouée et la remise fixe sortie, le seuil non
 * atteint gardé, le poids, le port offert durable à travers les révisions,
 * aucune surtaxe avec une dérogation dépensée, l'estimation égale à la
 * passation, le double clic et les refus d'un reliquat fermé.
 */
import { localToInstant, type AdminPlacedOrderResponse } from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import {
  abandonBackorder,
  backorderDecor,
  conversionBody,
  convertBackorder,
  deliveredTo,
  frozenOrder,
  openBackorder,
  pickupAt,
  placeOrigin,
  quoteBackorder,
  raiseCataloguePrice,
  SKU,
  staff,
  ZONE_A_FEE_CENTS,
  type BackorderDecor,
} from "./backorder-conversion-scene.js";
import { cardProvidersOverride } from "./card-payments.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { freshIntent } from "./intent-key.js";
import { posePromotion, promotionTerms } from "./promotion-fixtures.js";

const DAY = serviceDay(7);
const clock = new FixedClock(new Date());
let ctx: E2eContext;
let decor: BackorderDecor;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      {
        token: AdminTokenVerifier,
        value: {
          verify: (): Promise<{ subject: string; scopes: string[] }> =>
            Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
        },
      },
      cardProvidersOverride("pi_reliquat"),
      { token: Clock, value: clock },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(new Date());
  ctx.app.get(PricingMaterialsCache).invalidate();
  decor = await backorderDecor(ctx);
});

/** Une origine de 10 croissants au retrait, et son reliquat de 4. */
async function originWithBackorder(remaining = 4) {
  const originId = await placeOrigin(ctx, decor, DAY, [{ sku: SKU, quantity: 10 }]);
  const backorderId = await openBackorder(ctx, decor, originId, [
    { quantity: remaining, saleUnit: "piece" },
  ]);
  return { originId, backorderId };
}

function converted(
  backorderId: string,
  body = conversionBody(decor, DAY),
): Promise<AdminPlacedOrderResponse> {
  return convertBackorder(ctx, backorderId, body);
}

/** « −10 % » ou « −3 € » au panier, au retrait du point, éventuellement dès un seuil. */
async function basketPromotion(
  effect: { kind: "percent_off" | "basket_amount_off"; value: number },
  minQuantity: number | null = null,
): Promise<void> {
  await ctx.prisma.$executeRawUnsafe("SELECT public.bascule_des_promotions()");
  await posePromotion(
    staff(ctx),
    promotionTerms({
      label: { fr: `Remise ${effect.kind}`, en: null, it: null },
      effect,
      validFrom: daysAgo(1),
      fulfillment: { kind: "basket", pickup: { points: [decor.pickupId] }, delivery: "none" },
      conditions: minQuantity === null ? [] : [{ kind: "min_quantity", value: minQuantity }],
    }),
  );
  ctx.app.get(PricingMaterialsCache).invalidate();
}

describe("le prix de la commande d'origine", () => {
  it("le prix unitaire d'origine, même après une hausse du catalogue", async () => {
    const { originId, backorderId } = await originWithBackorder();
    const origin = await frozenOrder(ctx, originId);
    const originPrice = origin.lines[0]?.unitPriceMillicents ?? 0;
    await raiseCataloguePrice(ctx, originPrice * 2);

    const placed = await converted(backorderId);

    const order = await frozenOrder(ctx, placed.id);
    expect(order.lines).toEqual([
      expect.objectContaining({ sku: SKU, quantity: 4, unitPriceMillicents: originPrice }),
    ]);
    expect(order.subtotalCents).toBe((originPrice * 4) / 1_000);
  });

  it("la remise en pourcentage de l'origine est rejouée", async () => {
    await basketPromotion({ kind: "percent_off", value: 1_000 });
    const { originId, backorderId } = await originWithBackorder();
    expect((await frozenOrder(ctx, originId)).discountCents).toBeGreaterThan(0);

    const order = await frozenOrder(ctx, (await converted(backorderId)).id);

    expect(order.discountCents).toBe(Math.round(order.subtotalCents / 10));
  });

  it("la remise en montant fixe a servi sur l'origine : elle ne revient pas", async () => {
    await basketPromotion({ kind: "basket_amount_off", value: 300 });
    const { originId, backorderId } = await originWithBackorder();
    expect((await frozenOrder(ctx, originId)).discountCents).toBe(300);

    const order = await frozenOrder(ctx, (await converted(backorderId)).id);

    expect(order.discountCents).toBe(0);
  });

  it("un reste sous le seuil de la remise la garde (décision 11)", async () => {
    await basketPromotion({ kind: "percent_off", value: 1_000 }, 10);
    const { originId, backorderId } = await originWithBackorder(4);
    expect((await frozenOrder(ctx, originId)).discountCents).toBeGreaterThan(0);

    const order = await frozenOrder(ctx, (await converted(backorderId)).id);

    expect(order.discountCents).toBe(Math.round(order.subtotalCents / 10));
  });

  it("au poids : des grammes, le prix au kilo d'origine", async () => {
    await ctx.prisma.catalogItem.update({
      where: { sku: SKU },
      data: {
        saleUnit: "weight",
        weightStepGrams: 50,
        weightMinGrams: 200,
        priceMillicents: 4_000_000,
      },
    });
    ctx.app.get(PricingMaterialsCache).invalidate();
    const originId = await placeOrigin(ctx, decor, DAY, [
      { sku: SKU, quantity: 1_250, saleUnit: "weight" },
    ]);
    const backorderId = await openBackorder(ctx, decor, originId, [
      { quantity: 700, saleUnit: "weight" },
    ]);
    await raiseCataloguePrice(ctx, 5_000_000);

    const order = await frozenOrder(ctx, (await converted(backorderId)).id);

    // 40,00 € le kilo d'origine × 0,7 kg.
    expect(order.lines).toEqual([
      expect.objectContaining({
        quantity: 700,
        saleUnit: "weight",
        unitPriceMillicents: 4_000_000,
        lineTotalCents: 2_800,
      }),
    ]);
  });
});

describe("le port offert, durable", () => {
  it("livrée en zone à frais sous tout franco : frais nul, livraison offerte figée, la même à l'estimation", async () => {
    const { backorderId } = await originWithBackorder();
    const body = conversionBody(decor, DAY, deliveredTo(decor.addressA, "A"));
    const quoted = await quoteBackorder(ctx, backorderId, body);

    const order = await frozenOrder(ctx, (await converted(backorderId, body)).id);

    expect(quoted.amounts?.deliveryFeeCents).toBe(0);
    expect(order).toMatchObject({
      deliveryFeeCents: 0,
      deliveryFeeAdjustment: { mode: "amount", cents: ZONE_A_FEE_CENTS },
      freeDeliveryWaivedCents: ZONE_A_FEE_CENTS,
      deliveryOffered: true,
      totalCents: quoted.amounts?.totalCents,
    });
  });

  it("révisée vers une autre zone à frais : le port reste nul, au devis comme à la révision", async () => {
    const { backorderId } = await originWithBackorder();
    const placed = await converted(
      backorderId,
      conversionBody(decor, DAY, deliveredTo(decor.addressA, "A")),
    );
    const revision = { ...revisedContent(), ...deliveredTo(decor.addressB, "B") };

    const quote = await staff(ctx)
      .post(`/admin/orders/${placed.id}/revisions/quote`)
      .send(revision)
      .expect(200);
    await staff(ctx)
      .post(`/admin/orders/${placed.id}/revisions`)
      .send({ expectedRevision: 0, ...revision })
      .expect(200);

    const order = await frozenOrder(ctx, placed.id);
    expect(order).toMatchObject({ revision: 1, deliveryFeeCents: 0, deliveryOffered: true });
    expect(jsonBody<{ totalCents: number }>(quote).totalCents).toBe(order.totalCents);
  });

  it("transformée en retrait, puis révisée en livraison : port nul (décision 16)", async () => {
    const { backorderId } = await originWithBackorder();
    const placed = await converted(backorderId);
    expect((await frozenOrder(ctx, placed.id)).deliveryOffered).toBe(true);

    await staff(ctx)
      .post(`/admin/orders/${placed.id}/revisions`)
      .send({ expectedRevision: 0, ...revisedContent(), ...deliveredTo(decor.addressB, "B") })
      .expect(200);

    expect(await frozenOrder(ctx, placed.id)).toMatchObject({
      revision: 1,
      deliveryFeeCents: 0,
      deliveryOffered: true,
    });
  });
});

/** Le contenu de la commande issue du reliquat, inchangé sauf l'acheminement. */
function revisedContent(): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    note: "",
    lines: [{ sku: SKU, quantity: 4 }],
    ...pickupAt(decor),
  };
}

describe("après l'heure limite, avec dérogation et réglage de surtaxe", () => {
  it("aucune surtaxe, la dérogation consommée, l'estimation égale à la passation", async () => {
    const { backorderId } = await originWithBackorder();
    const today = serviceDay(0);
    await staff(ctx)
      .patch("/admin/order-cutoff-settings")
      .send({ sameDayPublicAllowed: true, sameDayProAllowed: true, sameDayProOnline: true })
      .expect(204);
    // Midi à Paris ; la limite du jour même tombée à 11 h 50, rattrapable 45 min.
    clock.set(localToInstant(today, "12:00") ?? new Date());
    await ctx.prisma.orderCutoff.create({
      data: {
        pickupAddressId: null,
        weekday: null,
        daysBefore: 0,
        time: "11:50",
        graceMinutes: 45,
      },
    });
    await staff(ctx)
      .put("/admin/order-late-fee")
      .send({ fee: { mode: "amount", cents: 500 }, vatRatePercent: 20 })
      .expect(204);
    const waiverId = jsonBody<{ id: string }>(
      await staff(ctx)
        .post("/admin/order-cutoff-waivers")
        .send({ companyId: decor.companyId, fulfillmentDate: today, reason: "Reliquat du jour" })
        .expect(201),
    ).id;
    const body = conversionBody(decor, today);
    const quoted = await quoteBackorder(ctx, backorderId, body);

    const placed = await converted(backorderId, body);

    const order = await frozenOrder(ctx, placed.id);
    expect(order.lateFeeCents).toBe(0);
    expect(quoted.amounts?.lateFeeCents).toBe(0);
    expect(order.totalCents).toBe(quoted.amounts?.totalCents);
    expect(placed.totalCents).toBe(order.totalCents);
    const waiver = await ctx.prisma.orderCutoffWaiver.findUniqueOrThrow({
      where: { id: waiverId },
    });
    expect(waiver.usedByOrderId).toBe(placed.id);
  });
});

describe("le reliquat fermé avec sa commande", () => {
  it("passe `converted`, lié à la commande, et le fait au journal", async () => {
    const { originId, backorderId } = await originWithBackorder();

    const placed = await converted(backorderId);

    const row = await ctx.prisma.backorder.findUniqueOrThrow({ where: { id: backorderId } });
    expect(row).toMatchObject({ state: "converted", convertedOrderId: placed.id });
    expect(row.closedAt).not.toBeNull();
    expect(row.closedByStaffId).not.toBeNull();
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "backorder.converted", subjectId: originId },
    });
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({
      orderId: placed.id,
      orderNumber: placed.orderNumber,
    });
  });

  it("double clic sous la même clé : la même commande, une seule", async () => {
    const { backorderId } = await originWithBackorder();
    const key = freshIntent();
    const body = conversionBody(decor, DAY);

    const seen = (await quoteBackorder(ctx, backorderId, body)).amounts?.totalCents;
    const send = () =>
      staff(ctx)
        .post(`/admin/backorders/${backorderId}/convert`)
        .set("Idempotency-Key", key)
        .send({ ...body, expectedTotalCents: seen })
        .expect(201);

    const first = jsonBody<AdminPlacedOrderResponse>(await send());
    const second = jsonBody<AdminPlacedOrderResponse>(await send());

    expect(second).toEqual(first);
    expect(await ctx.prisma.order.count({ where: { placedByUserId: decor.buyerId } })).toBe(2);
  });

  it("déjà transformé, sous une autre clé : refusé (409), aucune commande de plus", async () => {
    const { backorderId } = await originWithBackorder();
    await converted(backorderId);

    const refused = await staff(ctx)
      .post(`/admin/backorders/${backorderId}/convert`)
      .set("Idempotency-Key", freshIntent())
      .send({ ...conversionBody(decor, DAY), expectedTotalCents: 0 })
      .expect(409);

    expect(jsonBody<{ code: string }>(refused).code).toBe("orders.backorder.closed");
    expect(await ctx.prisma.order.count()).toBe(2);
  });

  it("abandonné : refusé (409), à l'estimation comme à la transformation", async () => {
    const { backorderId } = await originWithBackorder();
    await abandonBackorder(ctx, backorderId);

    await staff(ctx)
      .post(`/admin/backorders/${backorderId}/quote`)
      .send(conversionBody(decor, DAY))
      .expect(409);
    await staff(ctx)
      .post(`/admin/backorders/${backorderId}/convert`)
      .set("Idempotency-Key", freshIntent())
      .send({ ...conversionBody(decor, DAY), expectedTotalCents: 0 })
      .expect(409);
    expect(await ctx.prisma.order.count()).toBe(1);
  });

  it("un corps qui tenterait de régler le port est refusé : aucun champ ne le permet", async () => {
    const { backorderId } = await originWithBackorder();

    await staff(ctx)
      .post(`/admin/backorders/${backorderId}/convert`)
      .set("Idempotency-Key", freshIntent())
      .send({ ...conversionBody(decor, DAY), expectedTotalCents: 0, deliveryFeeCents: 1_500 })
      .expect(400);
  });

  it("un reliquat inconnu : 404", async () => {
    await staff(ctx)
      .post("/admin/backorders/bo_inconnu/quote")
      .send(conversionBody(decor, DAY))
      .expect(404);
  });
});
