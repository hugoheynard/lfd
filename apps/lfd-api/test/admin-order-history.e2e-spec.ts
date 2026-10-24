import { randomUUID } from "node:crypto";
/**
 * E2E de l'**historique d'une commande** (`GET /admin/orders/:id/history`, plan
 * `documentation/commandes/back-office/page-commandes.md`, §3 bis, lot C2b).
 *
 * Ce que seul le vrai SQL prouve : que les deux branches de la lecture mordent
 * (sujet `order`, et sujet `user` filtré sur `payload.orderId`), qu'un fait
 * d'une AUTRE commande du même client n'y entre pas, l'ordre, le 404 et la
 * porte `b2b_orders:read`.
 */
import type { ActivityEventView, RoleGrant } from "@lfd/contracts";
import type request from "supertest";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  daysAgo,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";

const SERVICE_DAY = serviceDay();
const SOLO = "auth0|history-solo";

let intentCounter = 0;
const fakeGateway = {
  createIntent: () => {
    intentCounter += 1;
    return Promise.resolve({
      paymentIntentId: `pi_history_${intentCounter}`,
      clientSecret: `pi_history_${intentCounter}_secret`,
    });
  },
  publishableKey: () => "pk_e2e",
  parseWebhook: () => ({ kind: "ignored" as const }),
  cancelIntent: () => Promise.resolve({ kind: "cancelled" as const }),
};

let ctx: E2eContext;

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
});

async function seedPickupPoint(): Promise<string> {
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
  return point.id;
}

/** Passe une commande de retrait par la vraie route, et rend son identifiant. */
async function place(pickupAddressId: string): Promise<string> {
  const response = await ctx
    .asSub(SOLO)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      requestedDeliveryDate: SERVICE_DAY,
      lines: [{ sku: "VIE-001", quantity: 1 }],
      companyId: null,
      fulfillmentMethod: "pickup",
      // Pas de commande sans créneau (2026-10-14).
      requestedWindow: { start: "07:00", end: "08:00" },
      pickupAddressId,
    })
    .expect(201);
  const { orderNumber } = jsonBody<{ orderNumber: string }>(response);
  const order = await ctx.prisma.order.findUniqueOrThrow({
    where: { orderNumber },
    select: { id: true },
  });
  return order.id;
}

/**
 * Un fait dont la commande est le SUJET (`delivery_bin.*`, `packing_container.*`).
 * Semé en ligne : le journal est append-only, sans agrégat à traverser, et
 * déclarer un bac demanderait toute la scène de tournée pour un seul fait.
 */
async function seedOrderSubjectFact(orderId: string, id: string, agoDays: number): Promise<void> {
  await ctx.prisma.activityEvent.create({
    data: {
      id,
      type: "delivery_bin.declared",
      occurredAt: new Date(daysAgo(agoDays)),
      subjectType: "order",
      subjectId: orderId,
      actorType: "staff",
      actorId: null,
      actorName: "Préparateur",
      actorRole: null,
      traceId: "trace-history",
      payload: { orderId },
      idempotencyKey: `delivery_bin.declared:${id}`,
    },
  });
}

async function history(orderId: string): Promise<readonly ActivityEventView[]> {
  return jsonBody<readonly ActivityEventView[]>(
    await ctx.asSub(E2E_STAFF_SUB).get(`/admin/orders/${orderId}/history`).expect(200),
  );
}

describe("GET /admin/orders/:id/history", () => {
  it("rend les faits de la commande, des deux sujets, sans ceux d'une autre commande du même client", async () => {
    await createUser(ctx.prisma, { auth0Sub: SOLO });
    const pickupId = await seedPickupPoint();
    const first = await place(pickupId);
    const second = await place(pickupId);
    await seedOrderSubjectFact(first, "evt-first-bin", 0);
    await seedOrderSubjectFact(second, "evt-second-bin", 0);

    const events = await history(first);

    const placed = events.filter((event) => event.type === "order.placed");
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ subjectType: "user", module: "commandes" });
    expect(placed[0]?.payload).toMatchObject({ orderId: first });
    expect(events.map((event) => event.id)).toContain("evt-first-bin");
    expect(events.map((event) => event.id)).not.toContain("evt-second-bin");
    expect(events.every((event) => event.payload["orderId"] === first)).toBe(true);
  });

  it("range les faits du plus récent au plus ancien", async () => {
    await createUser(ctx.prisma, { auth0Sub: SOLO });
    const orderId = await place(await seedPickupPoint());
    await seedOrderSubjectFact(orderId, "evt-old", 3);

    const events = await history(orderId);

    expect(events.at(-1)?.id).toBe("evt-old");
    const instants = events.map((event) => event.occurredAt);
    expect(instants).toEqual([...instants].sort().reverse());
  });

  it("répond 404 pour une commande inconnue", async () => {
    await ctx.asSub(E2E_STAFF_SUB).get("/admin/orders/absente/history").expect(404);
  });

  /** Un rôle créé à l'écran, qui ne tient que ces droits, et une personne qui le porte. */
  async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
    await ctx
      .asSub(E2E_STAFF_SUB)
      .post("/admin/staff-roles")
      .send({ key, label: key, grants })
      .expect(201);
    const sub = `staff-${key}`;
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: key,
        email: `${key}@lfc.test`,
        role: null,
        roleKey: key,
        status: "active",
        auth0Id: sub,
      },
    });
    return ctx.asSub(sub);
  }

  it("reste fermée en 403 à qui ne lit pas les commandes", async () => {
    await createUser(ctx.prisma, { auth0Sub: SOLO });
    const orderId = await place(await seedPickupPoint());
    const agent = await holderOf("retrait-seul", [
      { resource: "handover_counter", action: "read" },
    ]);

    await agent.get(`/admin/orders/${orderId}/history`).expect(403);
  });
});
