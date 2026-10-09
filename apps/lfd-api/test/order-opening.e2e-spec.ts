/**
 * E2E de **l'ouverture de la boutique à la commande** (Hugo, 2026-10-09 ;
 * doc `documentation/order/ouverture-de-la-boutique.md`).
 *
 * Ce que seul le vrai chemin prouve : que le réglage posé par la route staff
 * est relu par les passations, que la clientèle est DÉDUITE au serveur (une
 * société active = pro, l'espace perso = particulier), que la saisie de
 * l'équipe passe boutique fermée, et que la bascule est au journal.
 *
 * ⚠️ `POST /shop/orders` n'est pas servie (le contrôleur n'est pas enregistré,
 * cf. `shop-order.e2e-spec.ts`) : la commande sans compte est donc éprouvée par
 * son handler tel que l'application le monte, comme dans cette suite-là.
 */
import { randomUUID } from "node:crypto";

import type { OrderOpeningView, PublicOrderOpeningView } from "@lfd/contracts";

import { PlaceShopOrderCommand } from "../src/b2b/orders/application/commands/place-shop-order.command.js";
import { PlaceShopOrderHandler } from "../src/b2b/orders/application/commands/place-shop-order.handler.js";
import { OrdersClosedForAudienceError } from "../src/b2b/orders/domain/errors/orders-closed-for-audience.error.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const SERVICE_DAY = serviceDay();
const PERSO = "auth0|perso-ouverture";
const ACTIVE = "auth0|pro-ouverture";
const CLOSED = "orders.closed_for_audience";
const LINES = [{ sku: "VIE-001", quantity: 3 }];

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: E2E_STAFF_SUB, scopes: [] }),
};

let intentSeq = 0;
const fakeGateway = {
  createIntent: () => {
    intentSeq += 1;
    const paymentIntentId = `pi_opening_${String(intentSeq)}`;
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
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

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: fakeGateway },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

let pickupId = "";
let pro = { companyId: "", buyerId: "" };

beforeEach(async () => {
  await ctx.reset();
  pickupId = (
    await ctx.prisma.pickupAddress.create({
      data: {
        label: "Labo",
        ligne1: "5 rue du Four",
        ligne2: "",
        codePostal: "75002",
        ville: "Paris",
        pays: "France",
        isDefault: true,
      },
      select: { id: true },
    })
  ).id;
  await createUser(ctx.prisma, { auth0Sub: PERSO });
  const buyer = await createUser(ctx.prisma, { auth0Sub: ACTIVE });
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await attachTo(ctx.prisma, buyer.id, company.id, CustomerRole.owner);
  pro = { companyId: company.id, buyerId: buyer.id };
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

function clientOrder(): Record<string, unknown> {
  return {
    idempotencyKey: randomUUID(),
    pickupAddressId: pickupId,
    requestedDeliveryDate: SERVICE_DAY,
    fulfillmentMethod: "pickup",
    note: "",
    lines: LINES,
  };
}

async function placeAsGuest(): Promise<unknown> {
  const result = await ctx.app.get(PlaceShopOrderHandler).execute(
    new PlaceShopOrderCommand({
      idempotencyKey: randomUUID(),
      buyer: { firstName: "Camille", email: "camille@visiteur.fr", phone: "0600000000" },
      fulfillmentMethod: "pickup",
      deliveryAddress: null,
      deliveryAddressId: null,
      pickupAddressId: pickupId,
      requestedDeliveryDate: SERVICE_DAY,
      note: "",
      lines: LINES,
    }),
  );
  await ctx.drain();
  return result;
}

async function staffOrderForPro(): Promise<void> {
  await staff()
    .post("/admin/orders")
    .send({
      companyId: pro.companyId,
      buyerUserId: pro.buyerId,
      settlement: "link",
      requestedDeliveryDate: SERVICE_DAY,
      fulfillmentMethod: "pickup",
      pickupAddressId: pickupId,
      requestedWindow: { start: "07:00", end: "08:00" },
      lines: LINES,
    })
    .expect(201);
}

async function setOpening(patch: Record<string, boolean>): Promise<void> {
  await staff().patch("/admin/order-opening").send(patch).expect(204);
}

describe("le réglage", () => {
  it("ligne absente : ouverte aux deux, servie sans jeton et sans auteur", async () => {
    const response = await ctx.http().get("/order-opening").expect(200);

    expect(jsonBody<PublicOrderOpeningView>(response)).toEqual({
      ordersOpenToB2b: true,
      ordersOpenToB2c: true,
    });
  });

  it("se pose par le staff, garde son auteur, et chaque bascule va au journal", async () => {
    await setOpening({ ordersOpenToB2c: false });
    await setOpening({ ordersOpenToB2c: true });

    const view = jsonBody<OrderOpeningView>(await staff().get("/admin/order-opening").expect(200));
    expect(view).toMatchObject({ ordersOpenToB2b: true, ordersOpenToB2c: true });
    expect(view.updatedBy).toBe("Opérateur E2E");
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "order_opening.updated" },
      orderBy: { occurredAt: "asc" },
      select: { payload: true },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      {
        ordersOpenToB2b: true,
        ordersOpenToB2c: false,
        previous: { ordersOpenToB2b: true, ordersOpenToB2c: true },
      },
      {
        ordersOpenToB2b: true,
        ordersOpenToB2c: true,
        previous: { ordersOpenToB2b: true, ordersOpenToB2c: false },
      },
    ]);
  });

  it("refuse un patch qui ne règle aucune clientèle", async () => {
    await staff().patch("/admin/order-opening").send({}).expect(400);
  });
});

describe("fermée aux particuliers", () => {
  it("refuse le particulier connecté et la commande sans compte ; le pro et l'équipe passent", async () => {
    await setOpening({ ordersOpenToB2c: false });

    const perso = await ctx.asSub(PERSO).post("/orders").send(clientOrder()).expect(409);
    expect((perso.body as { code?: string }).code).toBe(CLOSED);
    expect((perso.body as { message?: string }).message).toContain(
      "ne prend pas de commandes des particuliers",
    );
    await expect(placeAsGuest()).rejects.toBeInstanceOf(OrdersClosedForAudienceError);
    expect(await ctx.prisma.order.count()).toBe(0);
    // Refusée AVANT d'inscrire le porteur : aucune personne sans commande.
    expect(await ctx.prisma.user.count()).toBe(2);

    await ctx.asSub(ACTIVE).post("/orders").send(clientOrder()).expect(201);
    await staffOrderForPro();
    expect(await ctx.prisma.order.count()).toBe(2);
  });
});

describe("fermée aux pros", () => {
  it("refuse le pro ; le particulier, la commande sans compte et l'équipe passent", async () => {
    await setOpening({ ordersOpenToB2b: false });

    const refused = await ctx.asSub(ACTIVE).post("/orders").send(clientOrder()).expect(409);
    expect((refused.body as { code?: string }).code).toBe(CLOSED);
    expect((refused.body as { message?: string }).message).toContain(
      "ne prend pas de commandes des pros",
    );
    expect(await ctx.prisma.order.count()).toBe(0);

    await ctx.asSub(PERSO).post("/orders").send(clientOrder()).expect(201);
    await placeAsGuest();
    // 🔴 L'équipe n'est jamais bloquée : elle saisit la commande prise au téléphone.
    await staffOrderForPro();
    expect(await ctx.prisma.order.count()).toBe(3);
  });

  it("rouverte, le pro commande de nouveau", async () => {
    await setOpening({ ordersOpenToB2b: false });
    await ctx.asSub(ACTIVE).post("/orders").send(clientOrder()).expect(409);

    await setOpening({ ordersOpenToB2b: true });

    await ctx.asSub(ACTIVE).post("/orders").send(clientOrder()).expect(201);
  });
});
