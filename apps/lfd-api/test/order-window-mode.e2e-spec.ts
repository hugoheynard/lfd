/**
 * E2E **créneau ou échéance** (plan `livraisons/plan-composition-automatique.md`,
 * CA-D2, §13) et **livraison sans fenêtre refusée** (CA1b), sur la vraie base.
 *
 * Ce que seule cette suite prouve : le réglage global posé par le staff et la
 * surcharge rangée dans le JSON de l'adresse arrivent bien jusqu'à la passation,
 * et la fenêtre figée sur la commande est celle que la règle a retenue.
 */
import { randomUUID } from "node:crypto";

import {
  type BillingAddressPayload,
  type CompanyAddressesView,
  type DeliveryAddressPayload,
  type OrderFulfillment,
  orderFulfillmentSchema,
} from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const OWNER = "auth0|owner";
const SERVICE_DAY = serviceDay();

/** Une intention NEUVE par commande : l'identifiant Stripe est unique en base. */
const fakeGateway = {
  createIntent: () => {
    const id = `pi_${randomUUID()}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
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
  const owner = await createUser(ctx.prisma, { auth0Sub: OWNER });
  const company = await createCompany(ctx.prisma, { status: "active" });
  companyId = company.id;
  await attachTo(ctx.prisma, owner.id, companyId, CustomerRole.owner);
  await ctx.prisma.deliveryZone.create({
    data: { postalPrefixes: ["73150"], label: "Val d'Isère", feeMode: "amount", feeValue: 2000 },
  });
});

async function setGlobal(windowMode: "slot" | "deadline"): Promise<void> {
  await ctx
    .asSub(E2E_STAFF_SUB)
    .patch("/admin/delivery-availability")
    .send({ windowMode })
    .expect(204);
}

/** Une adresse du carnet, avec ses consignes de fenêtre. */
async function bookAddress(specs: Partial<DeliveryAddressPayload["specs"]> = {}): Promise<string> {
  const payload: DeliveryAddressPayload = {
    ...POSTAL,
    isDefault: true,
    specs: {
      signatureRequired: null,
      note: "",
      slots: { mode: "everyday", slot: null },
      deliveryContact: null,
      gps: null,
      ...specs,
    },
  };
  const created = await ctx
    .asSub(OWNER)
    .post(`/companies/${companyId}/delivery-addresses`)
    .send(payload)
    .expect(201);
  return jsonBody<{ id: string }>(created).id;
}

function deliveryOrder(addressId: string | null, window?: unknown): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "delivery",
    deliveryAddress: POSTAL,
    deliveryAddressId: addressId,
    note: "",
    lines: [{ sku: "VIE-001", quantity: 2 }],
    ...(window === undefined ? {} : { requestedWindow: window }),
  };
}

async function agreedOf(orderId: string): Promise<OrderFulfillment> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { fulfillment: true },
  });
  return orderFulfillmentSchema.parse(row.fulfillment);
}

describe("créneau ou échéance à la passation (CA-D2)", () => {
  it("en échéance globale, passe une commande « avant 06:00 » et la fige sans début", async () => {
    await setGlobal("deadline");
    const addressId = await bookAddress();

    const placed = await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(deliveryOrder(addressId, { start: null, end: "06:00" }))
      .expect(201);

    const agreed = await agreedOf(jsonBody<{ id: string }>(placed).id);
    expect(agreed.window.value).toEqual({ start: null, end: "06:00" });
  });

  it("en échéance globale, refuse un début fourni, et rien n'est écrit", async () => {
    await setGlobal("deadline");
    const addressId = await bookAddress();

    const refused = await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(deliveryOrder(addressId, { start: "05:00", end: "06:00" }))
      .expect(400);

    expect(JSON.stringify(refused.body)).toContain("orders.fulfillment.deadline_with_start");
    expect(await ctx.prisma.order.count()).toBe(0);
  });

  it("la surcharge d'adresse l'emporte sur le global", async () => {
    await setGlobal("slot");
    const addressId = await bookAddress({ windowMode: "deadline" });

    await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(deliveryOrder(addressId, { start: "05:00", end: "06:00" }))
      .expect(400);
  });

  it("deux commandes le même jour, à la même adresse, sur deux échéances de la liste", async () => {
    const addressId = await bookAddress({
      windowMode: "deadline",
      deadlines: { mode: "everyday", times: ["06:00", "11:00"] },
    });

    const bread = await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(deliveryOrder(addressId, { start: null, end: "06:00" }))
      .expect(201);
    const lunch = await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(deliveryOrder(addressId, { start: null, end: "11:00" }))
      .expect(201);

    expect((await agreedOf(jsonBody<{ id: string }>(bread).id)).window).toEqual({
      value: { start: null, end: "06:00" },
      source: "default",
    });
    expect((await agreedOf(jsonBody<{ id: string }>(lunch).id)).window).toEqual({
      value: { start: null, end: "11:00" },
      source: "default",
    });
  });
});

describe("livraison sans fenêtre (CA1b)", () => {
  it("refuse une livraison sans créneau ni échéance, avec la phrase de sortie", async () => {
    const addressId = await bookAddress();

    const refused = await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(deliveryOrder(addressId))
      .expect(400);

    expect(JSON.stringify(refused.body)).toContain("orders.fulfillment.window_required");
    expect(await ctx.prisma.order.count()).toBe(0);
  });
});

describe("plusieurs créneaux par adresse (CA3b, §14.1)", () => {
  const MORNING = { start: "06:00", end: "08:00" };
  const EVENING = { start: "18:00", end: "20:00" };

  async function storedSpecs(addressId: string): Promise<DeliveryAddressPayload["specs"]> {
    const response = await ctx.asSub(OWNER).get(`/companies/${companyId}/addresses`).expect(200);
    const view = jsonBody<CompanyAddressesView>(response);
    const found = view.deliveries.find((address) => address.id === addressId);
    if (found === undefined) {
      throw new Error(`adresse ${addressId} absente du carnet relu`);
    }
    return found.specs;
  }

  it("range la liste et en dérive l'ancien créneau ; une charge SANS liste ne l'efface pas", async () => {
    const addressId = await bookAddress({
      slotList: { mode: "everyday", slots: [MORNING, EVENING] },
    });
    expect((await storedSpecs(addressId)).slots).toEqual({ mode: "everyday", slot: MORNING });

    // L'onglet resté sur l'ancien front renvoie `slots` sans connaître `slotList`.
    await ctx
      .asSub(OWNER)
      .patch(`/companies/${companyId}/delivery-addresses/${addressId}`)
      .send({
        ...POSTAL,
        isDefault: true,
        specs: {
          note: "sonner deux fois",
          slots: { mode: "everyday", slot: null },
          deliveryContact: null,
          gps: null,
        },
      })
      .expect(204);

    const specs = await storedSpecs(addressId);
    expect(specs.note).toBe("sonner deux fois");
    expect(specs.slotList).toEqual({ mode: "everyday", slots: [MORNING, EVENING] });
    expect(specs.slots).toEqual({ mode: "everyday", slot: MORNING });
  });

  it("refuse une liste qui se chevauche, et rien n'est écrit", async () => {
    await ctx
      .asSub(OWNER)
      .post(`/companies/${companyId}/delivery-addresses`)
      .send({
        ...POSTAL,
        isDefault: true,
        specs: {
          signatureRequired: null,
          note: "",
          slots: { mode: "everyday", slot: null },
          deliveryContact: null,
          gps: null,
          slotList: { mode: "everyday", slots: [MORNING, { start: "07:00", end: "09:00" }] },
        },
      })
      .expect(400);
    expect(await ctx.prisma.address.count({ where: { companyId, kind: "delivery" } })).toBe(0);
  });

  it("un seul créneau ce jour-là vaut reprise à la passation", async () => {
    await setGlobal("slot");
    const addressId = await bookAddress({ slotList: { mode: "everyday", slots: [EVENING] } });

    const placed = await ctx
      .asSub(OWNER)
      .post("/orders")
      .send(deliveryOrder(addressId, EVENING))
      .expect(201);

    expect((await agreedOf(jsonBody<{ id: string }>(placed).id)).window).toEqual({
      value: EVENING,
      source: "default",
    });
  });
});
