/**
 * E2E de `documentation/promotions/plan-jours-et-heures.md`, sur le vrai
 * Postgres : une promotion « tous les jours de 17 h à 19 h » au panier.
 *
 * 1. elle se pose, se relit telle quelle (JSONB `conditions`, sans migration) ;
 * 2. le devis la chiffre à 17 h 30 et ne la chiffre plus à 19 h 30 — où il
 *    dit qu'elle « a pris fin à 19 h » ;
 * 3. « dans le prix affiché », elle est refusée à la pose ; une plage qui
 *    passe minuit aussi ;
 * 4. jugée « au créneau », le devis qui porte le créneau la chiffre comme la
 *    passation du même créneau, et ne la chiffre pas hors des heures
 *    (décision du 2026-10-31, `promotions.md`, § 2.18).
 *
 * L'heure est figée par un `FixedClock` posé AUJOURD'HUI à 17 h 30 puis à
 * 19 h 30, à la pendule de Paris : jamais une date du calendrier en dur.
 */
import { randomUUID } from "node:crypto";

import {
  instantToLocal,
  localToInstant,
  type CreatedPickupResponse,
  type FulfillmentWindow,
  type PlacedOrderResponse,
  type PromotionTermsPayload,
  type PromotionView,
  type ShopQuoteView,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { PricingMaterialsCache } from "../src/b2b/pricing/infrastructure/pricing-materials.cache.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { promotionTerms } from "./promotion-fixtures.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

/** Aujourd'hui à cette heure de Paris (17 h 30 et 19 h 30 existent tous les jours). */
function todayAt(time: string): Date {
  const instant = localToInstant(instantToLocal(new Date()).day, time);
  if (instant === null) {
    throw new RangeError(`${time} n'existe pas aujourd'hui à Paris`);
  }
  return instant;
}

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_hours_${String(intentCounter)}`,
      clientSecret: `pi_hours_${String(intentCounter)}_secret`,
    });
  },
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

const clock = new FixedClock(todayAt("17:30"));
let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: Clock, value: clock },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  clock.set(todayAt("17:30"));
  ctx.app.get(PricingMaterialsCache).invalidate();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function antiGaspi(over: Partial<PromotionTermsPayload> = {}): PromotionTermsPayload {
  return promotionTerms({
    internalName: "Anti-gaspi du soir",
    label: { fr: "Anti-gaspi", en: null, it: null },
    effect: { kind: "percent_off", value: 5_000 },
    validFrom: daysAgo(1),
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    conditions: [
      {
        kind: "weekly_hours",
        moment: "ordered_at",
        announceOutside: false,
        windows: [{ weekdays: [...EVERY_DAY], start: "17:00", end: "19:00" }],
      },
    ],
    ...over,
  });
}

async function poseSite(): Promise<string> {
  const response = await staff()
    .post("/admin/pickup-addresses")
    .send({
      label: "Cœur de station",
      ligne1: "5 rue du Four",
      ligne2: "",
      codePostal: "75002",
      ville: "Paris",
      pays: "France",
      opening: { publicOpening: null, proPickup: null },
      discounts: { b2b: null, b2c: null },
    })
    .expect(201);
  return jsonBody<CreatedPickupResponse>(response).id;
}

async function quoteAt(pickupAddressId: string): Promise<ShopQuoteView> {
  const body = {
    lines: [{ sku: "VIE-001-1", quantity: 8 }],
    fulfillment: { method: "pickup", pickupAddressId },
  };
  return jsonBody<ShopQuoteView>(await ctx.http().post("/shop/quote").send(body).expect(200));
}

const LINES = [{ sku: "VIE-001-1", quantity: 8 }];
const SERVICE_DAY = serviceDay();

async function quoteForSlot(site: string, window: FulfillmentWindow): Promise<ShopQuoteView> {
  const body = {
    lines: LINES,
    fulfillment: { method: "pickup", pickupAddressId: site },
    requestedDeliveryDate: SERVICE_DAY,
    requestedWindow: window,
  };
  return jsonBody<ShopQuoteView>(await ctx.http().post("/shop/quote").send(body).expect(200));
}

async function guestPlacesForSlot(site: string, window: FulfillmentWindow): Promise<string> {
  const response = await ctx
    .http()
    .post("/shop/orders")
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
      fulfillmentMethod: "pickup",
      requestedWindow: window,
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddressId: site,
      requestedDeliveryDate: SERVICE_DAY,
      note: "",
      lines: LINES,
    })
    .expect(201);
  await ctx.drain();
  return jsonBody<PlacedOrderResponse>(response).id;
}

describe("une promotion de 17 h à 19 h, au panier", () => {
  it("se pose et se relit telle quelle, la phrase du journal disant ses heures", async () => {
    const posed = await staff().post("/admin/promotions").send(antiGaspi()).expect(201);
    const { id } = jsonBody<{ id: string }>(posed);
    const view = jsonBody<PromotionView>(await staff().get(`/admin/promotions/${id}`).expect(200));

    expect(view.conditions).toEqual(antiGaspi().conditions);
    expect(view.summary).toContain("commandé tous les jours de 17 h à 19 h");
  });

  it("le devis la chiffre dans la plage, et dit qu'elle a pris fin après", async () => {
    const site = await poseSite();
    await staff().post("/admin/promotions").send(antiGaspi()).expect(201);
    ctx.app.get(PricingMaterialsCache).invalidate();

    const inside = await quoteAt(site);
    expect(inside.discountCents).toBeGreaterThan(0);
    expect(inside.endedDiscounts).toBeUndefined();

    clock.set(todayAt("19:30"));
    const after = await quoteAt(site);
    expect(after.discountCents).toBe(0);
    expect(after.endedDiscounts).toEqual([
      { label: { fr: "Anti-gaspi", en: "Anti-gaspi", it: "Anti-gaspi" }, endedAt: "19:00" },
    ]);
  });

  it("refuse une promotion à heures « dans le prix affiché », en nommant le geste", async () => {
    const refused = await staff()
      .post("/admin/promotions")
      .send(antiGaspi({ fulfillment: { kind: "displayed_price" } }))
      .expect(400);

    const body = jsonBody<{ code: string; message: string }>(refused);
    expect(body.code).toBe("promotions.hours_at_displayed_price");
    expect(body.message).toContain("remise au panier");
  });

  it("refuse une plage qui passe minuit", async () => {
    const refused = await staff()
      .post("/admin/promotions")
      .send(
        antiGaspi({
          conditions: [
            {
              kind: "weekly_hours",
              moment: "ordered_at",
              announceOutside: false,
              windows: [{ weekdays: ["fri"], start: "22:00", end: "02:00" }],
            },
          ],
        }),
      )
      .expect(400);

    expect(jsonBody<{ code: string }>(refused).code).toBe("promotions.invalid_hours");
  });

  it("jugée au créneau : le devis qui porte le créneau chiffre ce que la passation écrit", async () => {
    const site = await poseSite();
    const atHandover = antiGaspi({
      conditions: [
        {
          kind: "weekly_hours",
          moment: "handover_at",
          announceOutside: false,
          windows: [{ weekdays: [...EVERY_DAY], start: "17:00", end: "19:00" }],
        },
      ],
    });
    await staff().post("/admin/promotions").send(atHandover).expect(201);
    ctx.app.get(PricingMaterialsCache).invalidate();
    // Hors de la plage À LA COMMANDE : seul le créneau peut la déclencher.
    clock.set(todayAt("09:00"));
    const evening = { start: "17:30", end: "18:00" };

    const quoted = await quoteForSlot(site, evening);
    const morning = await quoteForSlot(site, { start: "09:00", end: "10:00" });
    const orderId = await guestPlacesForSlot(site, evening);
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    expect(quoted.discountCents).toBeGreaterThan(0);
    expect(morning.discountCents).toBe(0);
    expect({ discountCents: order.discountCents, totalCents: order.totalCents }).toEqual({
      discountCents: quoted.discountCents,
      totalCents: quoted.totalCents,
    });
  });
});
