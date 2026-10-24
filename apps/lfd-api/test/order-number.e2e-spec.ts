import { randomUUID } from "node:crypto";
/**
 * E2E du **numéro de commande court** — `ORD-<n>`, un seul compteur pour toute
 * la plateforme (plan `documentation/commandes/passation/plan-numero-de-commande-court.md`).
 *
 * Ce que seul le vrai SQL prouve : le rang pris sous verrou dans la transaction
 * de passation (`order_number_counter`), l'absence de doublon sous concurrence,
 * et la coexistence avec les anciens numéros à deux tirets, jamais réécrits.
 */
import type { AdminOrdersPage } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

const SERVICE_DAY = serviceDay();
const SOLO = "auth0|solo";
/** Un ancien numéro, tel que le générateur d'avant le 2026-10-23 l'écrivait. */
const LEGACY_NUMBER = "ORD-MV84O2XA-Y9W3";
const CONCURRENT_PLACEMENTS = 6;

/** Un identifiant d'intention par appel : la colonne est `@unique`. */
let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_number_${intentCounter}`,
      clientSecret: `pi_number_${intentCounter}_secret`,
    });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;
let pickupId = "pickup_absent";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [ADMIN_VERIFIER_OVERRIDE, { token: PaymentGateway, value: fakeGateway }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await createUser(ctx.prisma, { auth0Sub: SOLO });
  const point = await ctx.prisma.site.create({
    data: {
      label: "Labo",
      ligne1: "1 rue du Four",
      codePostal: "73150",
      ville: "Val d'Isère",
      pays: "France",
      isDefault: true,
    },
    select: { id: true },
  });
  pickupId = point.id;
});

async function place(): Promise<{ id: string; orderNumber: string }> {
  const response = await ctx
    .asSub(SOLO)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      requestedDeliveryDate: SERVICE_DAY,
      lines: [{ sku: "VIE-001", quantity: 1 }],
      companyId: null,
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      pickupAddressId: pickupId,
    })
    .expect(201);
  return jsonBody<{ id: string; orderNumber: string }>(response);
}

const rankOf = (orderNumber: string): number => Number(orderNumber.slice("ORD-".length));

describe("le numéro de commande court", () => {
  it("deux passations prennent deux rangs consécutifs, à partir de 1", async () => {
    const first = await place();
    const second = await place();

    expect(first.orderNumber).toBe("ORD-1");
    expect(second.orderNumber).toBe("ORD-2");
  });

  it("des passations concurrentes ne partagent jamais un rang", async () => {
    const placed = await Promise.all(Array.from({ length: CONCURRENT_PLACEMENTS }, () => place()));

    const ranks = placed.map((order) => rankOf(order.orderNumber)).sort((a, b) => a - b);
    expect(new Set(ranks).size).toBe(CONCURRENT_PLACEMENTS);
    expect(ranks.every((rank) => Number.isSafeInteger(rank) && rank >= 1)).toBe(true);
  });

  it("une commande passée avant la bascule garde son ancien numéro", async () => {
    // L'ancienne commande : celle d'avant le compteur, à deux tirets.
    const legacy = await place();
    await ctx.prisma.order.update({
      where: { id: legacy.id },
      data: { orderNumber: LEGACY_NUMBER },
    });

    const next = await place();

    expect(next.orderNumber).toBe("ORD-2");
    const kept = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: legacy.id },
      select: { orderNumber: true },
    });
    expect(kept.orderNumber).toBe(LEGACY_NUMBER);
  });

  it("la recherche du back-office trouve ORD-1042", async () => {
    // Le compteur avance (jamais il ne recule) : la prochaine passation sera la 1042ᵉ.
    await ctx.prisma.orderNumberCounter.create({ data: { lastRank: 1041 } });
    const placed = await place();
    expect(placed.orderNumber).toBe("ORD-1042");

    const page = jsonBody<AdminOrdersPage>(
      await ctx.asSub(E2E_STAFF_SUB).get("/admin/orders?q=ORD-1042").expect(200),
    );
    expect(page.rows.map((row) => row.orderNumber)).toEqual(["ORD-1042"]);
  });
});
