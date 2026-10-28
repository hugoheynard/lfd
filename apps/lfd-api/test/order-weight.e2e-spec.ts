import { randomUUID } from "node:crypto";

import type { OrderView, PlacedOrderResponse } from "@lfd/contracts";
import { htMillicentsOf } from "@lfd/pim-contracts";

import {
  PaymentGateway,
  type CreateIntentParams,
} from "../src/b2b/payments/domain/payment-gateway.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { pickupSite } from "./order-factory.js";

/**
 * E2E — **passer une commande au poids, et la relire**
 * (`documentation/pricing/vente-au-poids.md`, P3).
 *
 * Ce que seul ce niveau prouve : la ligne s'écrit avec son unité sous le CHECK
 * de `order_lines.sale_unit`, se relit avec elle, et le montant que l'intention
 * Stripe reçoit est le prix au kilo × grammes / 1000 — pour un pro au HT, pour
 * un particulier à l'étiquette TTC du kilo. Une ligne sans unité sur un article
 * au poids est refusée en 400, jamais relue en grammes.
 */

const PRO = "auth0|pro-poids";
const PERSO = "auth0|perso-poids";
const SERVICE_DAY = serviceDay();
/** Le pro : 40,00 € HT le kilo. */
const PRO_PRICE_PER_KG_MILLICENTS = 4_000_000;
/** Le public : 42,20 € TTC le kilo, à 5,5 %. */
const PUBLIC_LABEL_PER_KG_CENTS = 4_220;

const intents: CreateIntentParams[] = [];
const fakeGateway = {
  createIntent: (params: CreateIntentParams) => {
    intents.push(params);
    const id = `pi_poids_${String(intents.length)}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;
let companyId = "";
let pickupId = "";

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
  intents.splice(0);
  await createUser(ctx.prisma, { auth0Sub: PERSO });
  const buyer = await createUser(ctx.prisma, { auth0Sub: PRO });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  companyId = company.id;
  pickupId = await pickupSite(ctx.prisma);
  await sellByWeight();
});

/** Le croissant du semis devient un article au poids : par 50 g, à partir de 200 g. */
async function sellByWeight(): Promise<void> {
  const htMillicents = htMillicentsOf(PUBLIC_LABEL_PER_KG_CENTS, 5.5);
  if (htMillicents === null) {
    throw new Error("Étiquette sans hors taxe.");
  }
  await ctx.prisma.catalogItem.update({
    where: { sku: "VIE-001-1" },
    data: {
      saleUnit: "weight",
      weightStepGrams: 50,
      weightMinGrams: 200,
      priceMillicents: PRO_PRICE_PER_KG_MILLICENTS,
      publicTtcCents: PUBLIC_LABEL_PER_KG_CENTS,
      publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents } },
    },
  });
}

function basket(line: Record<string, unknown>, company: string | null): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    companyId: company,
    fulfillmentMethod: "pickup",
    requestedWindow: { start: "07:00", end: "08:00" },
    pickupAddressId: pickupId,
    requestedDeliveryDate: SERVICE_DAY,
    note: "",
    lines: [line],
  };
}

const WEIGHED = { sku: "VIE-001", quantity: 1_250, saleUnit: "weight" };

describe("une commande au poids", () => {
  it("un pro : la ligne s'écrit en grammes au prix du kilo, et se relit avec son unité", async () => {
    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(PRO).post("/orders").send(basket(WEIGHED, companyId)).expect(201),
    );

    const [line] = await ctx.prisma.orderLine.findMany({ where: { orderId: placed.id } });
    // 40,00 € le kilo × 1,25 kg.
    expect(line).toMatchObject({
      saleUnit: "weight",
      quantity: 1_250,
      unitPriceMillicents: PRO_PRICE_PER_KG_MILLICENTS,
      lineTotalCents: 5_000,
    });
    const view = jsonBody<OrderView>(await ctx.asSub(PRO).get(`/orders/${placed.id}`).expect(200));
    expect(view.lines).toEqual([
      expect.objectContaining({ sku: "VIE-001", quantity: 1_250, saleUnit: "weight" }),
    ]);
  });

  it("un particulier : il paie l'étiquette du kilo × grammes / 1000, TTC", async () => {
    const placed = jsonBody<PlacedOrderResponse>(
      await ctx.asSub(PERSO).post("/orders").send(basket(WEIGHED, null)).expect(201),
    );

    // 42,20 € × 1,25 = 52,75 €.
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: placed.id } });
    expect(order).toMatchObject({ vatMethod: "exact_ht", totalCents: 5_275 });
    expect(intents.map((intent) => intent.amountCents)).toEqual([5_275]);
    const [line] = await ctx.prisma.orderLine.findMany({ where: { orderId: placed.id } });
    expect(line).toMatchObject({
      saleUnit: "weight",
      quantity: 1_250,
      unitPriceTtcCents: PUBLIC_LABEL_PER_KG_CENTS,
      lineTotalTtcCents: 5_275,
    });
  });

  it("refuse une ligne sans unité sur un article au poids, sans rien écrire", async () => {
    const response = await ctx
      .asSub(PRO)
      .post("/orders")
      .send(basket({ sku: "VIE-001", quantity: 1_250 }, companyId))
      .expect(400);

    expect(jsonBody<{ code: string }>(response).code).toBe("orders.line.sale_unit_mismatch");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("refuse un poids hors du pas", async () => {
    const response = await ctx
      .asSub(PRO)
      .post("/orders")
      .send(basket({ ...WEIGHED, quantity: 1_230 }, companyId))
      .expect(400);

    expect(jsonBody<{ code: string }>(response).code).toBe("orders.line.weight_off_step");
  });
});
