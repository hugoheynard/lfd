/**
 * E2E **seules les échéances et créneaux inscrits sont valides** (décision Hugo du
 * 2026-10-12) : en mode échéance, une heure demandée par le client qui n'est
 * pas une échéance de l'adresse ce jour-là est refusée, et rien n'est écrit.
 * La saisie staff reste libre (choix provisoire) et n'est pas éprouvée ici.
 */
import { randomUUID } from "node:crypto";

import type { BillingAddressPayload, DeliveryAddressPayload } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, jsonBody, serviceDay, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|owner";

const fakeGateway = {
  createIntent: () => {
    const id = `pi_${randomUUID()}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const POSTAL: BillingAddressPayload = {
  label: "Hôtel",
  ligne1: "12 rue du Test",
  ligne2: "",
  codePostal: "73150",
  ville: "Val d'Isère",
  pays: "France",
};

let ctx: E2eContext;
let companyId: string;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: PaymentGateway, value: fakeGateway }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  companyId = company.id;
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
});

async function deadlineAddress(times: readonly string[]): Promise<string> {
  // Une liste vide ne s'écrit pas (le contrat la refuse) : « aucune » = pas de liste.
  return bookAddress({
    windowMode: "deadline",
    ...(times.length === 0 ? {} : { deadlines: { mode: "everyday", times: [...times] } }),
  });
}

async function bookAddress(extra: Partial<DeliveryAddressPayload["specs"]>): Promise<string> {
  const payload: DeliveryAddressPayload = {
    ...POSTAL,
    isDefault: true,
    specs: {
      signatureRequired: null,
      note: "",
      slotList: { mode: "everyday", slots: [] },
      deliveryContact: null,
      gps: null,
      ...extra,
    },
  };
  const created = await ctx
    .asSub(OWNER)
    .post(`/companies/${companyId}/delivery-addresses`)
    .send(payload)
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

function orderBefore(addressId: string, end: string): Record<string, unknown> {
  return orderWithin(addressId, { start: null, end });
}

function orderWithin(
  addressId: string,
  window: { readonly start: string | null; readonly end: string },
): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    salesTerms: null,
    requestedDeliveryDate: serviceDay(),
    fulfillmentMethod: "delivery",
    deliveryAddress: POSTAL,
    deliveryAddressId: addressId,
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    requestedWindow: window,
  };
}

describe("une échéance hors de la liste de l'adresse (2026-10-12)", () => {
  it("refuse « avant 09:00 » quand l'adresse inscrit 06:00 et 11:00, et nomme les deux", async () => {
    const addressId = await deadlineAddress(["06:00", "11:00"]);

    const refused = await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(orderBefore(addressId, "09:00"))
      .expect(409);

    const body = JSON.stringify(refused.body);
    expect(body).toContain("orders.fulfillment.deadline_not_registered");
    expect(body).toContain("06:00, 11:00");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("refuse toute échéance quand l'adresse n'en inscrit aucune", async () => {
    const addressId = await deadlineAddress([]);

    await ctx.asSub(OWNER).post("/orders").send(orderBefore(addressId, "06:00")).expect(409);
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("accepte une échéance inscrite", async () => {
    const addressId = await deadlineAddress(["06:00", "11:00"]);

    await ctx.asSub(OWNER).post("/orders").send(orderBefore(addressId, "11:00")).expect(201);
  });
});

describe("un créneau hors de la liste de l'adresse (2026-10-12)", () => {
  const MORNING = { start: "06:00", end: "08:00" };

  it("refuse un créneau tapé à la main, et accepte le créneau inscrit", async () => {
    const addressId = await bookAddress({
      windowMode: "slot",
      slotList: { mode: "everyday", slots: [MORNING] },
    });

    const refused = await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(orderWithin(addressId, { start: "09:00", end: "10:00" }))
      .expect(409);
    expect(JSON.stringify(refused.body)).toContain("orders.fulfillment.slot_not_registered");
    expect(await ctx.prisma.order.count()).toBe(0);

    await ctx.asSub(OWNER).post("/orders").send(orderWithin(addressId, MORNING)).expect(201);
  });
});
