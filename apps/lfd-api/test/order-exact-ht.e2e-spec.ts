import { randomUUID } from "node:crypto";

import type {
  PlacedOrderResponse,
  SetLoyaltySettingsPayload,
  ShopCatalogueView,
} from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/pim-contracts";
import { CommandBus } from "@nestjs/cqrs";

import { ConvertLoyaltyPointsCommand } from "../src/b2b/loyalty/application/commands/convert-loyalty-points.command.js";
import {
  PaymentGateway,
  type CreateIntentParams,
} from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

/**
 * E2E de la **commande d'un particulier composée en TTC** — lot C2 du plan
 * `documentation/pricing/plan-centime-particuliers.md` (voie B).
 *
 * Ce que seule la base prouve : la méthode et les TTC des termes s'écrivent
 * sous leurs CHECK (`orders_ttc_terms_iff_exact_ht`), le montant que
 * l'intention Stripe reçoit est celui de la commande, et une commande `line_ht`
 * d'avant la voie B se révise sans changer de méthode.
 */

/** Un palier : 1 000 points valent 5 € — TTC pour un particulier (Q2). */
const SETTINGS: SetLoyaltySettingsPayload = {
  pointsPerStep: 1_000,
  stepValueCents: 500,
  openToPublic: true,
  openToPro: false,
  voucherValidityDays: 365,
  welcomeBonusPoints: null,
};

const CLIENT = "auth0|particulier-ttc";
const DAY_OF_SERVICE = serviceDay();
/** L'étiquette du banana bread : 21,00 € TTC à 5,5 % (plan, § 1). */
const BANANA_LABEL_CENTS = 2_100;

const intents: CreateIntentParams[] = [];
const fakeGateway = {
  createIntent: (params: CreateIntentParams) => {
    intents.push(params);
    const id = `pi_ttc_${String(intents.length)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_sec` });
  },
  retrieveIntent: (paymentIntentId: string) =>
    Promise.resolve({
      paymentIntentId,
      clientSecret: `${paymentIntentId}_sec`,
      state: "awaiting_payment" as const,
    }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
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
  intents.splice(0);
  const point = await ctx.prisma.site.create({
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
  await ctx.asSub(E2E_STAFF_SUB).put("/admin/loyalty/settings").send(SETTINGS).expect(204);
  await labelBananaBread();
});

/** Le croissant du semis devient un banana bread étiqueté 21,00 € au public. */
async function labelBananaBread(): Promise<void> {
  const htMillicents = htMillicentsOf(BANANA_LABEL_CENTS, 5.5);
  if (htMillicents === null) {
    throw new Error("Étiquette sans hors taxe.");
  }
  await ctx.prisma.catalogItem.update({
    where: { sku: "VIE-001-1" },
    data: {
      publicTtcCents: BANANA_LABEL_CENTS,
      publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents } },
    },
  });
}

async function client(): Promise<string> {
  const user = await createUser(ctx.prisma, { auth0Sub: CLIENT, firstName: "Léa" });
  return user.id;
}

/** Un bon d'un palier au nom de la personne, par la vraie conversion. */
async function voucherOf(userId: string): Promise<string> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .post("/admin/loyalty/adjustments")
    .send({ holderKind: "user", holderId: userId, points: 1_000, reason: "reprise" })
    .expect(204);
  return ctx.app
    .get(CommandBus)
    .execute<ConvertLoyaltyPointsCommand, string>(
      new ConvertLoyaltyPointsCommand("user", userId, userId, 1, null),
    );
}

function basket(quantity: number, voucherId?: string): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    pickupAddressId: pickupId,
    requestedDeliveryDate: DAY_OF_SERVICE,
    note: "",
    lines: [{ sku: "VIE-001", quantity }],
    ...(voucherId === undefined ? {} : { voucherId }),
  };
}

async function placed(body: Record<string, unknown>): Promise<PlacedOrderResponse> {
  return jsonBody<PlacedOrderResponse>(
    await ctx.asSub(CLIENT).post("/orders").send(body).expect(201),
  );
}

const orderRow = (id: string) => ctx.prisma.order.findUniqueOrThrow({ where: { id } });

describe("un particulier paie la somme des étiquettes", () => {
  it("banana bread à 21,00 € : devis 21,00, commande 21,00, intention Stripe 2 100", async () => {
    await client();
    const quote = jsonBody<{ totalCents: number }>(
      await ctx
        .http()
        .post("/shop/quote")
        .send({ lines: [{ sku: "VIE-001", quantity: 1 }], fulfillment: null })
        .expect(200),
    );

    const order = await placed(basket(1));

    const row = await orderRow(order.id);
    expect(quote.totalCents).toBe(BANANA_LABEL_CENTS);
    expect(row).toMatchObject({
      vatMethod: "exact_ht",
      totalCents: BANANA_LABEL_CENTS,
      subtotalCents: 1_990,
      vatCents: 110,
      discountTtcCents: 0,
      voucherTtcCents: 0,
      deliveryFeeTtcCents: 0,
    });
    expect(intents.map((intent) => intent.amountCents)).toEqual([BANANA_LABEL_CENTS]);
    expect(order.payment?.amountCents).toBe(BANANA_LABEL_CENTS);
    const lines = await ctx.prisma.orderLine.findMany({ where: { orderId: order.id } });
    expect(lines).toEqual([
      expect.objectContaining({
        unitPriceTtcCents: BANANA_LABEL_CENTS,
        lineTotalTtcCents: BANANA_LABEL_CENTS,
        lineTotalCents: 1_990,
      }),
    ]);
  });

  it("prend la remise retrait sur le TTC : −10 % de 21,00 € = 2,10 €", async () => {
    await client();
    await ctx.prisma.site.update({
      where: { id: pickupId },
      data: { b2cDiscountMode: "percent", b2cDiscountValue: 1_000 },
    });

    const order = await placed(basket(1));

    const row = await orderRow(order.id);
    expect(row).toMatchObject({ discountTtcCents: 210, totalCents: 1_890 });
    expect(row.discountAdjustment).toEqual({ mode: "percent", bp: 1_000 });
    expect(intents.map((intent) => intent.amountCents)).toEqual([1_890]);
    expect(row.subtotalCents - row.discountCents + row.vatCents).toBe(row.totalCents);
  });

  it("le bon retire sa valeur faciale TTC : 5,00 € sur 21,00 € = 16,00 €", async () => {
    const userId = await client();
    const voucherId = await voucherOf(userId);

    const order = await placed(basket(1, voucherId));

    const row = await orderRow(order.id);
    expect(row).toMatchObject({ voucherTtcCents: 500, totalCents: 1_600 });
    expect(row.voucherDiscountCents).toBeLessThan(500);
    expect(intents.map((intent) => intent.amountCents)).toEqual([1_600]);
    expect(row.subtotalCents - row.voucherDiscountCents + row.vatCents).toBe(row.totalCents);
  });

  it("un bon qui couvre tout : le registre décompte la valeur faciale servie", async () => {
    const userId = await client();
    const voucherId = await voucherOf(userId);
    // Un article à 3,00 € TTC : le bon de 5 € le couvre, le reste fait le reliquat.
    const htMillicents = htMillicentsOf(300, 5.5) ?? 0;
    await ctx.prisma.catalogItem.update({
      where: { sku: "VIE-001-1" },
      data: {
        publicTtcCents: 300,
        publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents } },
      },
    });

    const order = await placed(basket(1, voucherId));

    const row = await orderRow(order.id);
    expect(row).toMatchObject({ totalCents: 0, voucherTtcCents: 300 });
    const remainders = await ctx.prisma.loyaltyVoucher.findMany({
      where: { parentVoucherId: voucherId },
    });
    expect(remainders.map((remainder) => remainder.valueCents)).toEqual([200]);
  });
});

describe("l'étiquette de la boutique (lot C3)", () => {
  it("une étiquette saisie 1,53 € à 20 % s'affiche 1,53 € au public, pas 1,54 €", async () => {
    const htMillicents = htMillicentsOf(153, 20) ?? 0;
    await ctx.prisma.catalogItem.update({
      where: { sku: "VIE-001-1" },
      data: {
        publicTtcCents: 153,
        publicByContext: { takeaway: { vatRatePercent: 20, htMillicents } },
      },
    });

    const view = jsonBody<ShopCatalogueView>(await ctx.http().get("/shop/catalogue").expect(200));

    const item = view.items.find((candidate) => candidate.sku === "VIE-001");
    expect(item?.unitPriceTtcCents).toBe(153);
  });
});

describe("une commande line_ht d'avant la voie B", () => {
  it("révisée par l'équipe, elle reste line_ht", async () => {
    const userId = await client();
    const voucherId = await voucherOf(userId);
    const order = await placed(basket(1, voucherId));
    // Ramenée à ce qu'une commande d'avant le déploiement porte : `line_ht`, sans TTC
    // de terme, et un bon couvrant les 19,91 € HT de marchandises (total nul).
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: {
        vatMethod: "line_ht",
        discountTtcCents: null,
        voucherTtcCents: null,
        deliveryFeeTtcCents: null,
        voucherDiscountCents: 1_991,
        subtotalCents: 1_991,
        vatCents: 0,
        totalCents: 0,
        // Gratuite, donc sans intention : la seule commande de particulier que
        // la révision M1 accepte (une commande par carte est le lot M2).
        paymentStatus: "not_required",
        stripePaymentIntentId: null,
      },
    });

    await ctx
      .asSub(E2E_STAFF_SUB)
      .post(`/admin/orders/${order.id}/revisions`)
      .send({
        expectedRevision: 0,
        requestedDeliveryDate: DAY_OF_SERVICE,
        fulfillmentMethod: "pickup",
        pickupAddressId: pickupId,
        requestedWindow: { start: "07:00", end: "08:00" },
        note: "Sans sucre glace",
        lines: [{ sku: "VIE-001", quantity: 1 }],
      })
      .expect(200);

    const row = await orderRow(order.id);
    expect(row).toMatchObject({
      revision: 1,
      vatMethod: "line_ht",
      discountTtcCents: null,
      voucherTtcCents: null,
      deliveryFeeTtcCents: null,
      voucherDiscountCents: 1_991,
      totalCents: 0,
    });
  });
});
