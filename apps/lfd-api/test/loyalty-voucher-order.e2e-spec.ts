import { randomUUID } from "node:crypto";

/**
 * E2E du **bon de fidélité sur la commande** (plan
 * `documentation/comptabilite/plan-points-de-fidelite.md`, lot C, §11 C8).
 *
 * Ce que seul le vrai Postgres prouve :
 * - deux passations simultanées sur le même bon : le verrou du titulaire les
 *   met en file, une seule passe, l'autre ne laisse ni commande ni clé ;
 * - la libération vit dans la MÊME transaction que l'annulation — par
 *   l'abandon comme par la clôture —, et l'index unique partiel laisse
 *   réutiliser un bon libéré ;
 * - le reliquat, à la passation d'une commande sans règlement et au
 *   rattrapage de nuit, n'est émis qu'une fois ;
 * - le devis dit le total que la commande facture ;
 * - l'assiette des points retranche le bon.
 *
 * Stripe et la signature du jeton staff sont les seules frontières doublées.
 * Les commandes « payées » ou « remises » sont semées par Prisma, faute
 * d'agrégat qui sache écrire une commande à cet état (même dette que
 * `loyalty-earning.e2e-spec.ts`) ; les bons, eux, naissent par la vraie
 * conversion.
 */
import type { PlacedOrderResponse, SetLoyaltySettingsPayload, ShopQuoteView } from "@lfd/contracts";
import { CommandBus } from "@nestjs/cqrs";
import request from "supertest";

import { ConvertLoyaltyPointsCommand } from "../src/b2b/loyalty/application/commands/convert-loyalty-points.command.js";
import { PendingSettlementSweep } from "../src/b2b/orders/application/services/pending-settlement-sweep.service.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from "../src/platform/database/client/client.js";
import { ServiceDay } from "../src/production/channels/commerce/index.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Un palier : 1 000 points valent 5 € HT. */
const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
};

const CLIENT = "auth0|bon-fidele";
const OTHER = "auth0|bon-voisin";
const DAY_OF_SERVICE = serviceDay();

let created = 0;
const cancelledIntents: string[] = [];
const fakeGateway = {
  createIntent: () => {
    created += 1;
    const id = `pi_bon_${String(created)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_sec` });
  },
  retrieveIntent: (paymentIntentId: string) =>
    Promise.resolve({
      paymentIntentId,
      clientSecret: `${paymentIntentId}_sec`,
      state: "awaiting_payment" as const,
    }),
  cancelIntent: (id: string) => {
    cancelledIntents.push(id);
    return Promise.resolve({ kind: "cancelled" as const });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let ctx: E2eContext;
let pickupId = "";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: PaymentGateway, value: fakeGateway },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  created = 0;
  cancelledIntents.splice(0);
  const point = await ctx.prisma.pickupAddress.create({
    data: {
      label: "Le Labo",
      ligne1: "Route de la Balme",
      ligne2: "",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
  await ctx
    .asSub(E2E_STAFF_SUB)
    .put("/admin/accounting/loyalty/settings")
    .send(SETTINGS)
    .expect(204);
});

/** Une personne, et un bon de `steps` paliers à son nom — par la vraie conversion. */
async function holderWithVoucher(
  sub = CLIENT,
  steps = 1,
): Promise<{ userId: string; voucherId: string }> {
  const user = await createUser(ctx.prisma, { auth0Sub: sub, firstName: "Léa" });
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/accounting/loyalty/adjustments")
    .send({ holderKind: "user", holderId: user.id, points: steps * 1_000, reason: "reprise" })
    .expect(204);
  const voucherId = await ctx.app
    .get(CommandBus)
    .execute<ConvertLoyaltyPointsCommand, string>(
      new ConvertLoyaltyPointsCommand("user", user.id, user.id, steps),
    );
  return { userId: user.id, voucherId };
}

/** Un panier de retrait : `quantity` croissants à 2 € HT. */
function basket(quantity: number, voucherId?: string): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedDeliveryDate: DAY_OF_SERVICE,
    note: "",
    lines: [{ sku: "VIE-001", quantity }],
    ...(voucherId === undefined ? {} : { voucherId }),
  };
}

const place = (body: Record<string, unknown>, sub = CLIENT) =>
  ctx.asSub(sub).post("/orders").send(body);

async function placed(body: Record<string, unknown>): Promise<PlacedOrderResponse> {
  return jsonBody<PlacedOrderResponse>(await place(body).expect(201));
}

const voucherRow = (id: string) => ctx.prisma.loyaltyVoucher.findUniqueOrThrow({ where: { id } });
const orderRow = (id: string) => ctx.prisma.order.findUniqueOrThrow({ where: { id } });
const remaindersOf = (parentVoucherId: string) =>
  ctx.prisma.loyaltyVoucher.findMany({ where: { parentVoucherId } });

async function nightly(): Promise<{ vouchers: { reserved: number; settled: number } }> {
  const response = await ctx
    .http()
    .post("/admin/loyalty/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return jsonBody<{ vouchers: { reserved: number; settled: number } }>(response);
}

/** Le bon passé sa date limite, comme s'il avait été converti il y a plus d'un an. */
async function ageVoucher(voucherId: string): Promise<void> {
  await ctx.prisma.loyaltyVoucher.update({
    where: { id: voucherId },
    data: { issuedAt: new Date(daysAgo(400)), expiresAt: new Date(daysAgo(35)) },
  });
}

describe("la passation avec un bon", () => {
  it("réserve le bon et impute sa valeur HT, à part de la remise", async () => {
    const { voucherId } = await holderWithVoucher();

    const order = await placed(basket(10, voucherId));

    const row = await orderRow(order.id);
    expect(row).toMatchObject({ voucherDiscountCents: 500, loyaltyVoucherId: voucherId });
    expect(order.payment?.amountCents).toBe(row.totalCents);
    expect((await voucherRow(voucherId)).status).toBe("reserved");
  });

  it("deux passations simultanées sur le même bon : une passe, l'autre 409 sans commande ni clé", async () => {
    const { voucherId } = await holderWithVoucher();

    const responses = await Promise.all([
      place(basket(10, voucherId)),
      place(basket(12, voucherId)),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await ctx.prisma.order.count()).toBe(1);
    expect(await ctx.prisma.orderIdempotency.count()).toBe(1);
    // L'intention du perdant, déjà créée, est annulée.
    expect(cancelledIntents).toHaveLength(1);
  });

  it("refuse le bon d'une autre personne (404), sans rien écrire", async () => {
    const { voucherId } = await holderWithVoucher(OTHER);
    await createUser(ctx.prisma, { auth0Sub: CLIENT });

    const response = await place(basket(10, voucherId)).expect(404);

    expect(jsonBody<{ code: string }>(response).code).toBe("loyalty.voucher_unknown");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("refuse un bon sur une commande de société (400)", async () => {
    const { userId, voucherId } = await holderWithVoucher();
    const company = await createCompany(ctx.prisma, { enseigne: "Hôtel des Cimes" });
    await attachTo(ctx.prisma, userId, company.id);

    const response = await place(basket(10, voucherId)).expect(400);

    expect(jsonBody<{ code: string }>(response).code).toBe("orders.voucher_not_for_company_order");
    expect((await voucherRow(voucherId)).status).toBe("available");
  });

  it("rejouer la clé avec un autre bon est refusé, pas rendu comme un rejeu", async () => {
    const first = await holderWithVoucher(CLIENT, 2);
    const body = basket(10, first.voucherId);
    await place(body).expect(201);

    const response = await place({ ...body, voucherId: "un-autre-bon" }).expect(409);

    expect(jsonBody<{ code: string }>(response).code).toBe("orders.idempotency.reused");
  });
});

describe("le reliquat", () => {
  it("un panier que le bon couvre : total nul, sans règlement, reliquat émis à la passation", async () => {
    const { voucherId } = await holderWithVoucher();
    const parent = await voucherRow(voucherId);

    const order = await placed(basket(1, voucherId));

    const row = await orderRow(order.id);
    // Un croissant vaut moins qu'un palier : le bon couvre tout, et le reste
    // devient le reliquat.
    const goods = row.subtotalCents - row.discountCents;
    expect(goods).toBeLessThan(500);
    expect(row).toMatchObject({
      totalCents: 0,
      paymentStatus: PaymentStatus.not_required,
      voucherDiscountCents: goods,
    });
    expect(order.payment).toBeUndefined();
    const remainders = await remaindersOf(voucherId);
    expect(remainders).toHaveLength(1);
    expect(remainders[0]).toMatchObject({
      valueCents: 500 - goods,
      pointsCost: 0,
      status: "available",
      userId: parent.userId,
      expiresAt: parent.expiresAt,
    });

    expect((await voucherRow(voucherId)).remainderSettledAt).not.toBeNull();
    expect((await nightly()).vouchers.reserved).toBe(0);
    expect(await remaindersOf(voucherId)).toHaveLength(1);
  });

  it("une commande payée reçoit son reliquat au rattrapage de nuit, une seule fois", async () => {
    const { userId, voucherId } = await holderWithVoucher(CLIENT, 2);
    await seedOrderCarrying(userId, voucherId, { voucherDiscountCents: 400, paid: true });

    expect((await nightly()).vouchers.settled).toBe(1);
    await nightly();

    const remainders = await remaindersOf(voucherId);
    expect(remainders).toHaveLength(1);
    expect(remainders[0]?.valueCents).toBe(600);
  });

  /** Plan §11 bis B2 : le bon a expiré entre le paiement et la nuit. */
  it("un bon échu avant le rattrapage : aucun reliquat, un seul fait, la nuit suivante est silencieuse", async () => {
    const { userId, voucherId } = await holderWithVoucher(CLIENT, 2);
    await seedOrderCarrying(userId, voucherId, { voucherDiscountCents: 400, paid: true });
    await ageVoucher(voucherId);

    expect((await nightly()).vouchers).toMatchObject({ reserved: 1, settled: 1 });
    expect((await nightly()).vouchers).toMatchObject({ reserved: 0, settled: 0 });

    expect(await remaindersOf(voucherId)).toHaveLength(0);
    expect((await voucherRow(voucherId)).remainderSettledAt).not.toBeNull();
    expect(
      await ctx.prisma.activityEvent.count({ where: { type: "loyalty.voucher_remainder_lapsed" } }),
    ).toBe(1);
  });

  it("un bon entièrement imputé est marqué soldé, et la nuit suivante ne le relit pas", async () => {
    const { userId, voucherId } = await holderWithVoucher(CLIENT, 2);
    await seedOrderCarrying(userId, voucherId, { voucherDiscountCents: 1_000, paid: true });

    expect((await nightly()).vouchers).toMatchObject({ reserved: 1, settled: 1 });
    expect((await nightly()).vouchers).toMatchObject({ reserved: 0, settled: 0 });

    expect(await remaindersOf(voucherId)).toHaveLength(0);
    expect((await voucherRow(voucherId)).remainderSettledAt).not.toBeNull();
  });
});

describe("la libération", () => {
  async function placedWithVoucher(): Promise<{ orderId: string; voucherId: string }> {
    const { voucherId } = await holderWithVoucher();
    const order = await placed(basket(10, voucherId));
    return { orderId: order.id, voucherId };
  }

  it("l'abandon rend le bon, qui resert aussitôt sur une autre commande", async () => {
    const { orderId, voucherId } = await placedWithVoucher();

    await ctx.asSub(CLIENT).post(`/orders/${orderId}/abandon`).expect(204);
    await ctx.drain();

    expect((await voucherRow(voucherId)).status).toBe("available");
    expect((await orderRow(orderId)).loyaltyVoucherId).toBe(voucherId);
    const again = await placed(basket(10, voucherId));
    expect((await orderRow(again.id)).loyaltyVoucherId).toBe(voucherId);
  });

  it("l'abandon après la date limite fait passer le bon à expiré", async () => {
    const { orderId, voucherId } = await placedWithVoucher();
    await ageVoucher(voucherId);

    await ctx.asSub(CLIENT).post(`/orders/${orderId}/abandon`).expect(204);
    await ctx.drain();

    const voucher = await voucherRow(voucherId);
    expect(voucher.status).toBe("expired");
    expect(voucher.expiredAt).not.toBeNull();
  });

  it("la clôture rend le bon de la commande qu'elle annule", async () => {
    const { orderId, voucherId } = await placedWithVoucher();

    await ctx.app.get(PendingSettlementSweep).sweep(ServiceDay.of(DAY_OF_SERVICE));

    expect((await orderRow(orderId)).status).toBe(OrderStatus.cancelled);
    expect((await voucherRow(voucherId)).status).toBe("available");
  });

  it("la clôture après la date limite fait passer le bon à expiré", async () => {
    const { voucherId } = await placedWithVoucher();
    await ageVoucher(voucherId);

    await ctx.app.get(PendingSettlementSweep).sweep(ServiceDay.of(DAY_OF_SERVICE));

    expect((await voucherRow(voucherId)).status).toBe("expired");
  });
});

describe("le devis et l'assiette", () => {
  it("le devis reconnu dit le total que la commande facture", async () => {
    const { voucherId } = await holderWithVoucher();
    const quote = jsonBody<ShopQuoteView>(
      await ctx
        .asSub(CLIENT)
        .post("/shop/quote/mine")
        .send({
          lines: [{ sku: "VIE-001", quantity: 10 }],
          fulfillment: { method: "pickup", pickupAddressId: pickupId },
          voucherId,
        })
        .expect(200),
    );

    const order = await placed(basket(10, voucherId));

    expect(quote.voucherDiscountCents).toBe(500);
    expect(quote.totalCents).toBe((await orderRow(order.id)).totalCents);
  });

  it("le devis anonyme refuse un bon (400)", async () => {
    const { voucherId } = await holderWithVoucher();

    const response = await request(ctx.app.getHttpServer())
      .post("/shop/quote")
      .send({ lines: [{ sku: "VIE-001", quantity: 2 }], fulfillment: null, voucherId })
      .expect(400);

    expect(jsonBody<{ code: string }>(response).code).toBe("orders.voucher_requires_sign_in");
  });

  it("une commande définitive rapporte le HT payé : sous-total − remise − bon", async () => {
    const { userId, voucherId } = await holderWithVoucher();
    await seedOrderCarrying(userId, voucherId, {
      voucherDiscountCents: 500,
      paid: true,
      fulfilled: true,
    });

    await nightly();

    const earned = await ctx.prisma.loyaltyLedgerEntry.findFirstOrThrow({
      where: { userId, kind: "earned" },
    });
    expect(earned.points).toBe(2_000 - 160 - 500);
  });
});

let sequence = 0;

/**
 * Une commande publique qui porte le bon, semée à l'état voulu — et le bon
 * engagé, comme la passation l'aurait laissé.
 */
async function seedOrderCarrying(
  userId: string,
  voucherId: string,
  state: { voucherDiscountCents: number; paid: boolean; fulfilled?: boolean },
): Promise<string> {
  sequence += 1;
  const order = await ctx.prisma.order.create({
    data: {
      orderNumber: `CMD-BON-${String(sequence)}`,
      placedByUserId: userId,
      clientele: OrderClientele.public,
      status: state.fulfilled === true ? OrderStatus.fulfilled : OrderStatus.placed,
      subtotalCents: 2_000,
      discountCents: 160,
      voucherDiscountCents: state.voucherDiscountCents,
      loyaltyVoucherId: voucherId,
      totalCents: 2_000 - 160 - state.voucherDiscountCents,
      paymentStatus: state.paid ? PaymentStatus.paid : PaymentStatus.pending,
      stripePaymentIntentId: `pi_seme_${String(sequence)}`,
      requestedDeliveryDate: new Date(DAY_OF_SERVICE),
    },
    select: { id: true },
  });
  await ctx.prisma.loyaltyVoucher.update({
    where: { id: voucherId },
    data: { status: "reserved" },
  });
  return order.id;
}
