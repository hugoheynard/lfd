/**
 * E2E de la **passation sur stock** (lot L4 —
 * `documentation/limites-de-commande/jour-meme-sur-stock.md`).
 *
 * Ce que seul le vrai SQL prouve : que deux passations sur le dernier article
 * se suivent sous le verrou consultatif du stock au lieu de se croiser ; que
 * le reste lu sous ce verrou est celui que la réception affiche ; qu'une
 * commande abandonnée rend sa part par l'expiration ; et qu'une passation sur
 * stock ne prend JAMAIS le verrou de la journée — elle passe pendant qu'un
 * arrêt du plan le tient.
 *
 * Les passations de l'invité passent par le handler tel que l'application le
 * monte (vrais ports, vrai Prisma) : la route publique est bridée en débit.
 * Deux frontières doublées : la signature du jeton et la passerelle Stripe.
 */
import { randomUUID } from "node:crypto";

import type {
  FulfillmentDayView,
  PlaceShopOrderPayload,
  ResupplyReceiptView,
} from "@lfd/contracts";
import { instantToLocal, localToInstant } from "@lfd/contracts";

import { placeShopOrderSeeingTotal, type Unseen } from "./seen-total-shop-command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { UnsettledShopOrderExpiry } from "../src/b2b/orders/application/services/unsettled-shop-order-expiry.service.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { CompanyStatus } from "../src/platform/database/client/client.js";
import { Clock } from "../src/platform/time/clock.js";
import { FixedClock } from "../src/platform/time/fixed-clock.js";
import { PlanAdmissionDesk, ServiceDay } from "../src/production/channels/commerce/index.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, E2E_STAFF_SUB, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

/** Une intention distincte par appel : `stripe_payment_intent_id` est unique en base. */
let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const paymentIntentId = `pi_shelf_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  },
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment" as const,
    }),
  publishableKey: () => "pk_shelf",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const CROISSANT = "VIE-001-1";
const BREAD = "PAI-001-1";
const RECEIVED = 10;
const MINUTE = 60_000;

/** Midi aujourd'hui à Paris : un créneau public à 14 h reste. */
function todayAt(time: string): Date {
  return localToInstant(instantToLocal(new Date()).day, time) ?? new Date();
}

const clock = new FixedClock(todayAt("12:00"));
let ctx: E2eContext;
let siteId = "";
let day = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
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
  clock.set(todayAt("12:00"));
  day = instantToLocal(clock.now()).day;
  siteId = await seedShop();
});

const staff = () => ctx.asSub(E2E_STAFF_SUB);

/** Une boutique ouverte au public, des créneaux de 14 h à 18 h, dix croissants reçus. */
async function seedShop(): Promise<string> {
  const site = await ctx.prisma.site.create({
    data: {
      label: "Boutique du Centre",
      ligne1: "1 place du Centre",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      opening: {
        publicOpening: { start: "07:00", end: "19:00" },
        proPickup: { start: "07:00", end: "19:00" },
      },
    },
    select: { id: true },
  });
  await staff()
    .put(`/admin/pickup-addresses/${site.id}/creneaux-publics`)
    .send({
      rules: [
        {
          weekday: null,
          startTime: "14:00",
          endTime: "18:00",
          slotMinutes: 60,
          badge: null,
          serviceCapacity: null,
        },
      ],
      closures: [],
    })
    .expect(204);
  const today = instantToLocal(clock.now()).day;
  await staff()
    .post(`/admin/resupply-receipts/${site.id}/${today}/lines`)
    .send({ sku: CROISSANT, quantity: RECEIVED })
    .expect(204);
  return site.id;
}

async function openSameDay(over: Record<string, unknown> = {}): Promise<void> {
  await staff()
    .patch("/admin/order-cutoff-settings")
    .send({
      sameDayPublicAllowed: true,
      sameDayProAllowed: true,
      sameDayProOnline: true,
      ...over,
    })
    .expect(204);
}

/**
 * Arrête le plan d'aujourd'hui, par la route du fournil. Une journée vide ne
 * s'arrête pas : une saisie de l'équipe, au compte, fabriquée, y entre d'abord.
 */
async function closeToday(): Promise<void> {
  const pro = await seedCreditedPro("auth0|pro-l4", "pro@l4.fr");
  await staff()
    .post("/admin/orders")
    .send({
      companyId: pro.companyId,
      buyerUserId: pro.userId,
      settlement: "account",
      requestedDeliveryDate: day,
      fulfillmentMethod: "pickup",
      pickupAddressId: siteId,
      requestedWindow: { start: "14:00", end: "15:00" },
      lines: [{ sku: CROISSANT, quantity: 2 }],
    })
    .expect(201);
  await staff().post(`/admin/production/batch/${day}/close`).expect(201);
  await ctx.drain();
}

/** Un pro actif, avec un crédit au compte accordé, et son acheteur. */
async function seedCreditedPro(
  auth0Sub: string,
  email: string,
): Promise<{ readonly companyId: string; readonly userId: string }> {
  const user = await createUser(ctx.prisma, { auth0Sub, email });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  await attachTo(ctx.prisma, user.id, company.id);
  return { companyId: company.id, userId: user.id };
}

function shopPayload(lines: PlaceShopOrderPayload["lines"]): Unseen<PlaceShopOrderPayload> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    buyer: { firstName: "Camille", email: `${randomUUID()}@visiteur.fr`, phone: "0600000000" },
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "14:00", end: "15:00" },
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddressId: siteId,
    requestedDeliveryDate: day,
    note: "",
    lines,
  };
}

/** La passation de l'invité, par le handler monté. */
async function placeShop(lines: PlaceShopOrderPayload["lines"]): Promise<string> {
  const placed = await placeShopOrderSeeingTotal(
    ctx.app.get(PlaceShopOrderHandler),
    shopPayload(lines),
  );
  await ctx.drain();
  return placed.id;
}

async function supplyOf(orderId: string): Promise<string> {
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { supply: true },
  });
  return order.supply;
}

/** Le reste des croissants, tel que la réception l'affiche. */
async function croissantsLeft(): Promise<number | undefined> {
  const receipt = jsonBody<ResupplyReceiptView>(
    await staff().get(`/admin/resupply-receipts/${siteId}/${day}`).expect(200),
  );
  return receipt.stock.find((line) => line.sku === CROISSANT)?.estimatedStock;
}

describe("la passation sur stock (L4) — le serveur décide la marque", () => {
  it("plan d'aujourd'hui arrêté : la commande de l'invité est prise sur la vitrine", async () => {
    await openSameDay();
    await closeToday();

    const orderId = await placeShop([{ sku: CROISSANT, quantity: 3 }]);

    expect(await supplyOf(orderId)).toBe("shelf");
    expect(await croissantsLeft()).toBe(RECEIVED - 3);
  });

  it("plan d'aujourd'hui rouvert : la commande est fabriquée, la vitrine n'est pas touchée", async () => {
    await openSameDay();
    await closeToday();
    await staff().post(`/admin/production/batch/${day}/reopen`).expect(201);
    await ctx.drain();

    const orderId = await placeShop([{ sku: CROISSANT, quantity: 3 }]);

    expect(await supplyOf(orderId)).toBe("planned");
    expect(await croissantsLeft()).toBe(RECEIVED);
  });

  it("la boutique propose aujourd'hui au point qui vend encore, demain à la livraison", async () => {
    await openSameDay();
    await closeToday();

    const days = jsonBody<readonly FulfillmentDayView[]>(
      await ctx.http().get("/fulfillment-days").query({ skus: CROISSANT }).expect(200),
    );

    expect(days.find((entry) => entry.pickupAddressId === siteId)).toEqual({
      pickupAddressId: siteId,
      date: day,
      orderUntil: null,
    });
    expect(days[0]?.date).not.toBe(day);
  });
});

describe("la passation sur stock (L4) — les refus", () => {
  beforeEach(async () => {
    await openSameDay();
    await closeToday();
  });

  /** Deux transactions, un dernier lot : le verrou du stock fait attendre la seconde. */
  it("course au dernier article : de deux passations, une seule passe", async () => {
    const outcomes = await Promise.allSettled([
      placeShop([{ sku: CROISSANT, quantity: 6 }]),
      placeShop([{ sku: CROISSANT, quantity: 6 }]),
    ]);

    const refused = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ reason: { code: "orders.shelf.stock_short" } });
    expect(await croissantsLeft()).toBe(RECEIVED - 6);
  });

  it("un panier mixte — un article absent de la vitrine — est refusé, sans rien écrire", async () => {
    const before = await ctx.prisma.order.count();

    await expect(
      placeShop([
        { sku: CROISSANT, quantity: 1 },
        { sku: BREAD, quantity: 1 },
      ]),
    ).rejects.toMatchObject({ code: "orders.shelf.stock_short" });
    expect(await ctx.prisma.order.count()).toBe(before);
  });

  it("plus de créneau aujourd'hui au point : refusé", async () => {
    clock.set(todayAt("18:30"));

    await expect(placeShop([{ sku: CROISSANT, quantity: 1 }])).rejects.toMatchObject({
      code: "orders.shelf.no_pickup_left",
    });
  });

  it("la clientèle que le réglage n'ouvre pas : refusée", async () => {
    await openSameDay({ sameDayPublicAllowed: false });

    await expect(placeShop([{ sku: CROISSANT, quantity: 1 }])).rejects.toMatchObject({
      code: "orders.same_day_closed",
    });
  });
});

describe("la passation sur stock (L4) — la tenue du stock et les verrous", () => {
  beforeEach(async () => {
    await openSameDay({ shelfHoldMinutes: 15 });
    await closeToday();
  });

  it("un paiement abandonné rend sa part après la durée réglée", async () => {
    const orderId = await placeShop([{ sku: CROISSANT, quantity: 4 }]);
    expect(await croissantsLeft()).toBe(RECEIVED - 4);
    // `created_at` est posé par la base : l'âge se compte depuis lui.
    const { createdAt } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { createdAt: true },
    });

    clock.set(new Date(createdAt.getTime() + 14 * MINUTE));
    await ctx.app.get(UnsettledShopOrderExpiry).expireLapsed();
    expect(await croissantsLeft()).toBe(RECEIVED - 4);

    clock.set(new Date(createdAt.getTime() + 16 * MINUTE));
    await ctx.app.get(UnsettledShopOrderExpiry).expireLapsed();
    await ctx.drain();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order.status).toBe("cancelled");
    expect(await croissantsLeft()).toBe(RECEIVED);
  });

  /**
   * Complément L4 (Hugo, 2026-11-02, §6 Q3 bis) : une commande sur stock que
   * l'équipe envoie au lien de paiement expire aussi à la durée réglée — un
   * lien jamais réglé ne retient plus la vitrine sans limite.
   */
  it("une commande de l'équipe au lien de paiement, non réglée, rend sa part après la durée réglée", async () => {
    const pro = await seedCreditedPro("auth0|pro-l4-link", "lien@l4.fr");
    const placed = await staff()
      .post("/admin/orders")
      .send({
        companyId: pro.companyId,
        buyerUserId: pro.userId,
        settlement: "link",
        supply: "shelf",
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        pickupAddressId: siteId,
        requestedWindow: { start: "14:00", end: "15:00" },
        lines: [{ sku: CROISSANT, quantity: 3 }],
      })
      .expect(201);
    await ctx.drain();
    const orderId = jsonBody<{ readonly id: string }>(placed).id;
    expect(await supplyOf(orderId)).toBe("shelf");
    expect(await croissantsLeft()).toBe(RECEIVED - 3);
    const { createdAt } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { createdAt: true },
    });

    clock.set(new Date(createdAt.getTime() + 14 * MINUTE));
    await ctx.app.get(UnsettledShopOrderExpiry).expireLapsed();
    expect(await croissantsLeft()).toBe(RECEIVED - 3);

    clock.set(new Date(createdAt.getTime() + 16 * MINUTE));
    await ctx.app.get(UnsettledShopOrderExpiry).expireLapsed();
    await ctx.drain();

    const order = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });
    expect(order.status).toBe("cancelled");
    expect(await croissantsLeft()).toBe(RECEIVED);
  });

  /**
   * §12 (sérieux) : l'annulation d'une commande sur stock ne traverse pas le
   * guichet du fournil — elle n'y a jamais été inscrite — et rend sa part.
   */
  it("l'annulation par l'équipe rend la quantité à la vitrine", async () => {
    const orderId = await placeShop([{ sku: CROISSANT, quantity: 4 }]);

    const cancelled = await staff()
      .post(`/admin/orders/${orderId}/cancel`)
      .send({ reason: "le client ne viendra pas" });
    await ctx.drain();

    expect(cancelled.status).toBe(204);
    expect(await croissantsLeft()).toBe(RECEIVED);
  });

  /**
   * §11.2 : le verrou du stock et celui de la journée ne sont jamais tenus
   * ensemble. Si la passation sur stock prenait le second, elle attendrait
   * ici une transaction qui ne finit qu'après elle — le test expirerait.
   */
  it("passe pendant qu'une autre transaction tient le verrou de la journée", async () => {
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = (): void => undefined;
    const holding = new Promise<void>((resolve) => {
      held = resolve;
    });
    const holder = ctx.app.get(UnitOfWork).run(async () => {
      await ctx.app.get(PlanAdmissionDesk).admit(ServiceDay.of(day));
      held();
      await released;
    });
    await holding;

    try {
      const orderId = await placeShop([{ sku: CROISSANT, quantity: 1 }]);
      expect(await supplyOf(orderId)).toBe("shelf");
    } finally {
      release();
      await holder;
    }
  });
});

/**
 * Lot L5 (§12 bloquant 2, §13) : une commande sur stock au compte se modifie
 * dans la limite du reste, sous le verrou du stock ; le fournil n'en reçoit
 * aucune note ; sa journée ne change pas ; une commande par carte reste non
 * modifiable (M1, limite acceptée par Hugo le 2026-11-02).
 */
describe("la modification d'une commande sur stock (L5)", () => {
  beforeEach(async () => {
    await openSameDay();
    await closeToday();
  });

  /** Une saisie de l'équipe sur la vitrine, au compte, pour un pro crédité. */
  async function placeCounterShelf(quantity: number): Promise<string> {
    const pro = await seedCreditedPro("auth0|pro-l5", "pro@l5.fr");
    const placed = await staff()
      .post("/admin/orders")
      .send({
        companyId: pro.companyId,
        buyerUserId: pro.userId,
        settlement: "account",
        supply: "shelf",
        requestedDeliveryDate: day,
        fulfillmentMethod: "pickup",
        pickupAddressId: siteId,
        requestedWindow: { start: "14:00", end: "15:00" },
        lines: [{ sku: CROISSANT, quantity }],
      })
      .expect(201);
    await ctx.drain();
    return jsonBody<{ readonly id: string }>(placed).id;
  }

  function reviseTo(orderId: string, expectedRevision: number, quantity: number, over = {}) {
    return staff()
      .post(`/admin/orders/${orderId}/revisions`)
      .send({
        expectedRevision,
        fulfillmentMethod: "pickup",
        pickupAddressId: siteId,
        requestedWindow: { start: "14:00", end: "15:00" },
        requestedDeliveryDate: day,
        deliveryAddress: null,
        deliveryAddressId: null,
        note: "",
        lines: [{ sku: CROISSANT, quantity }],
        ...over,
      });
  }

  it("se modifie dans la limite du reste, sans note au fournil ; une baisse rend le stock", async () => {
    const orderId = await placeCounterShelf(3);
    expect(await croissantsLeft()).toBe(RECEIVED - 3);

    await reviseTo(orderId, 0, 9).expect(200);
    await ctx.drain();
    expect(await croissantsLeft()).toBe(RECEIVED - 9);

    const refused = await reviseTo(orderId, 1, 11);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "orders.shelf.stock_short" });
    expect(await croissantsLeft()).toBe(RECEIVED - 9);

    await reviseTo(orderId, 1, 4).expect(200);
    await ctx.drain();
    expect(await croissantsLeft()).toBe(RECEIVED - 4);
    expect(await ctx.prisma.orderRevisionNotice.count({ where: { orderId } })).toBe(0);
  });

  it("changer la journée est refusé", async () => {
    const orderId = await placeCounterShelf(3);
    const tomorrow = instantToLocal(new Date(clock.now().getTime() + 24 * 60 * MINUTE)).day;

    const refused = await reviseTo(orderId, 0, 3, { requestedDeliveryDate: tomorrow });

    expect(refused.body).toMatchObject({ code: "orders.revise.shelf_route" });
    expect(await croissantsLeft()).toBe(RECEIVED - 3);
  });

  it("une commande sur stock réglée par carte reste non modifiable (M1)", async () => {
    const orderId = await placeShop([{ sku: CROISSANT, quantity: 2 }]);

    const refused = await reviseTo(orderId, 0, 1);

    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "orders.revise.card_settled" });
  });
});
