/**
 * E2E du **reliquat d'un particulier** (lot B6, plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5 bis,
 * décision 13), sur le vrai Postgres : il naît à la décision du départ d'une
 * commande `exact_ht` payée par carte ; il se transforme en commande réglée
 * à la caisse de la boutique (`shop_till`, `not_required`, CHECK
 * `orders_shop_till_shape`) ou offerte, au prix d'origine — l'étiquette TTC
 * comprise, après une hausse du catalogue —, port offert ; il s'abandonne ;
 * et l'origine remboursée de son reste par E9 n'est liée à la nouvelle
 * commande par aucun argent.
 *
 * Les jours sont relatifs (`serviceDay`) ; aucune date du calendrier.
 */
import type {
  AdminBackorderParticularPlacedResponse,
  AdminOrderEstimateView,
} from "@lfd/contracts";

import { PricingMaterialsCache } from "../src/lafoliecoffee/pricing/infrastructure/pricing-materials.cache.js";
import { jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { freshIntent, INTENT_KEY } from "./intent-key.js";
import { pickupSite } from "./order-factory.js";
import { CROISSANT, STAFF } from "./production-day-fixture.js";
import {
  bootShortfallCardScene,
  type CapturingMailer,
  departIncomplete,
  paidCardShortfall,
  refundSettles,
  resetScene,
  type ScriptedRefunds,
  shortfallRequests,
} from "./shortfall-card-refund-scene.js";
import { decide } from "./shortfall-decision-scene.js";

/** Le jour de la commande issue du reliquat : après le jour servi de l'origine. */
const CONVERTED_DAY = serviceDay(9);
const OFFER = { nature: "goodwill", note: "Le reste de la commande", notifyCustomer: false };

let ctx: E2eContext;
let issued: string[];
let mailer: CapturingMailer;
let refunds: ScriptedRefunds;

beforeAll(async () => {
  ({ ctx, issued, mailer, refunds } = await bootShortfallCardScene());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await resetScene(ctx, mailer, refunds);
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(STAFF);

/** Une commande de 3 croissants par carte, un seul au sac, le départ décidé : 2 en reliquat. */
async function particularBackorder(): Promise<{ originId: string; backorderId: string }> {
  const origin = await paidCardShortfall(ctx, issued, "individual", 3);
  expect((await decide(ctx, origin.id)).status).toBe(204);
  const backorder = await ctx.prisma.backorder.findUniqueOrThrow({
    where: { originOrderId: origin.id },
  });
  return { originId: origin.id, backorderId: backorder.id };
}

async function body(venue: "shop_till" | "offered"): Promise<Record<string, unknown>> {
  return {
    venue,
    ...(venue === "offered" ? { offer: OFFER } : {}),
    fulfillmentMethod: "pickup",
    pickupAddressId: await pickupSite(ctx.prisma),
    deliveryAddress: null,
    deliveryAddressId: null,
    requestedDeliveryDate: CONVERTED_DAY,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
  };
}

async function quote(
  backorderId: string,
  sent: Record<string, unknown>,
): Promise<AdminOrderEstimateView> {
  return jsonBody<AdminOrderEstimateView>(
    await staff().post(`/admin/backorders/${backorderId}/quote`).send(sent).expect(200),
  );
}

async function convert(
  backorderId: string,
  sent: Record<string, unknown>,
): Promise<AdminBackorderParticularPlacedResponse> {
  const quoted = await quote(backorderId, sent);
  return jsonBody<AdminBackorderParticularPlacedResponse>(
    await staff()
      .post(`/admin/backorders/${backorderId}/convert`)
      .set(INTENT_KEY, freshIntent())
      .send({ ...sent, expectedTotalCents: quoted.amounts?.totalCents ?? -1 })
      .expect(201),
  );
}

function orderOf(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      companyId: true,
      clientele: true,
      vatMethod: true,
      entryOrigin: true,
      paymentStatus: true,
      settlementVenue: true,
      deliveryFeeCents: true,
      deliveryOffered: true,
      lateFeeCents: true,
      totalCents: true,
      customerCancellableUntil: true,
      lines: {
        select: { sku: true, quantity: true, unitPriceMillicents: true, unitPriceTtcCents: true },
      },
    },
  });
}

async function raiseCroissant(): Promise<void> {
  const item = await ctx.prisma.catalogItem.findUniqueOrThrow({ where: { sku: CROISSANT } });
  if (item.priceMillicents === null) {
    throw new TypeError("Le croissant du décor doit avoir un prix.");
  }
  await ctx.prisma.catalogItem.update({
    where: { sku: CROISSANT },
    data: { priceMillicents: item.priceMillicents * 2 },
  });
  ctx.app.get(PricingMaterialsCache).invalidate();
}

describe("la naissance du reliquat d'un particulier (B6)", () => {
  it("la décision du départ d'une commande exact_ht fait naître un reliquat sans société", async () => {
    const { originId, backorderId } = await particularBackorder();

    const origin = await orderOf(originId);
    expect(origin).toMatchObject({ companyId: null, clientele: "public", vatMethod: "exact_ht" });
    const backorder = await ctx.prisma.backorder.findUniqueOrThrow({ where: { id: backorderId } });
    expect(backorder).toMatchObject({
      state: "open",
      companyId: null,
      lines: [{ sku: CROISSANT, quantity: 2, sale_unit: "piece" }],
    });
    const listed = jsonBody<{ id: string; company: unknown }[]>(
      await staff().get("/admin/backorders").expect(200),
    );
    expect(listed).toEqual([expect.objectContaining({ id: backorderId, company: null })]);
  });
});

describe("transformé en commande réglée en boutique", () => {
  it("shop_till, not_required, au comptoir, l'étiquette TTC d'origine après une hausse, port nul", async () => {
    const { originId, backorderId } = await particularBackorder();
    const origin = await orderOf(originId);
    await raiseCroissant();

    const placed = await convert(backorderId, await body("shop_till"));

    expect(placed.venue).toBe("shop_till");
    const order = await orderOf(placed.id);
    expect(order).toMatchObject({
      companyId: null,
      clientele: "public",
      entryOrigin: "counter",
      paymentStatus: "not_required",
      settlementVenue: "shop_till",
      deliveryFeeCents: 0,
      deliveryOffered: true,
      lateFeeCents: 0,
      totalCents: placed.totalCents,
    });
    // Le délai d'annulation du particulier, figé comme dans son espace.
    expect(order.customerCancellableUntil).not.toBeNull();
    expect(order.lines).toEqual([
      {
        sku: CROISSANT,
        quantity: 2,
        unitPriceMillicents: origin.lines[0]?.unitPriceMillicents,
        unitPriceTtcCents: origin.lines[0]?.unitPriceTtcCents,
      },
    ]);
    expect(placed.totalCents).toBe(2 * (origin.lines[0]?.unitPriceTtcCents ?? 0));
    expect(
      await ctx.prisma.backorder.findUniqueOrThrow({ where: { id: backorderId } }),
    ).toMatchObject({
      state: "converted",
      convertedOrderId: placed.id,
    });
  });

  it("l'estimation rend le total de la transformation, et un total vu périmé est refusé", async () => {
    const { backorderId } = await particularBackorder();
    const sent = await body("shop_till");
    const quoted = await quote(backorderId, sent);

    const refused = await staff()
      .post(`/admin/backorders/${backorderId}/convert`)
      .set(INTENT_KEY, freshIntent())
      .send({ ...sent, expectedTotalCents: (quoted.amounts?.totalCents ?? 0) + 1 });
    expect(refused.status).toBe(409);

    const placed = await convert(backorderId, sent);
    expect(placed.totalCents).toBe(quoted.amounts?.totalCents);
  });

  it("double clic : la même clé rend la même commande, une seule écrite", async () => {
    const { backorderId } = await particularBackorder();
    const sent = await body("shop_till");
    const key = freshIntent();
    const quoted = await quote(backorderId, sent);
    const twice = { ...sent, expectedTotalCents: quoted.amounts?.totalCents ?? -1 };
    const post = () =>
      staff().post(`/admin/backorders/${backorderId}/convert`).set(INTENT_KEY, key).send(twice);

    const first = jsonBody<AdminBackorderParticularPlacedResponse>(await post().expect(201));
    const second = jsonBody<AdminBackorderParticularPlacedResponse>(await post().expect(201));

    expect(second).toEqual(first);
    expect(await ctx.prisma.order.count({ where: { entryOrigin: "counter" } })).toBe(1);
  });

  it("le corps d'un pro est refusé sur le reliquat d'un particulier, et un corps mêlé est un 400", async () => {
    const { backorderId } = await particularBackorder();
    const sent = await body("shop_till");
    const { venue: _venue, ...pickup } = sent;

    const asPro = await staff()
      .post(`/admin/backorders/${backorderId}/quote`)
      .send({ ...pickup, buyerUserId: "u_x", settlement: "account" });
    expect(asPro.status).toBe(409);
    expect(jsonBody<{ code: string }>(asPro).code).toBe(
      "orders.backorder.particular_not_convertible",
    );

    const mixed = await staff()
      .post(`/admin/backorders/${backorderId}/quote`)
      .send({ ...sent, settlement: "account" });
    expect(mixed.status).toBe(400);
  });
});

describe("transformé en commande offerte, ou abandonné", () => {
  it("offerte : total nul, port offert, reliquat fermé", async () => {
    const { backorderId } = await particularBackorder();

    const placed = await convert(backorderId, await body("offered"));

    expect(placed).toMatchObject({ venue: "offered", totalCents: 0 });
    expect(await orderOf(placed.id)).toMatchObject({
      paymentStatus: "not_required",
      settlementVenue: null,
      deliveryOffered: true,
      totalCents: 0,
    });
    expect(
      (await ctx.prisma.backorder.findUniqueOrThrow({ where: { id: backorderId } })).state,
    ).toBe("converted");
  });

  it("abandonné : 204, puis plus aucun geste", async () => {
    const { backorderId } = await particularBackorder();

    await staff().post(`/admin/backorders/${backorderId}/abandon`).expect(204);

    expect(
      (await ctx.prisma.backorder.findUniqueOrThrow({ where: { id: backorderId } })).state,
    ).toBe("abandoned");
    await staff()
      .post(`/admin/backorders/${backorderId}/quote`)
      .send(await body("shop_till"))
      .expect(409);
  });
});

describe("l'origine payée par carte, puis la boutique", () => {
  it("E9 rembourse le reste au solde ; la commande issue est réglée en boutique, sans lien d'argent", async () => {
    const origin = await paidCardShortfall(ctx, issued, "individual", 3);
    await departIncomplete(ctx, origin);
    const { requests } = await shortfallRequests(ctx, origin.id);
    expect(requests).toHaveLength(1);
    await refundSettles(ctx, refunds.forRequest(requests[0]?.id ?? ""));
    const backorder = await ctx.prisma.backorder.findUniqueOrThrow({
      where: { originOrderId: origin.id },
    });

    const placed = await convert(backorder.id, await body("shop_till"));

    expect(await orderOf(placed.id)).toMatchObject({
      paymentStatus: "not_required",
      settlementVenue: "shop_till",
    });
    // Aucun paiement par carte pour la commande issue, aucune demande de plus sur l'origine.
    expect(
      await ctx.prisma.cardPayment.count({ where: { subjectType: "order", subjectId: placed.id } }),
    ).toBe(0);
    expect((await shortfallRequests(ctx, origin.id)).requests).toHaveLength(1);
  });
});
