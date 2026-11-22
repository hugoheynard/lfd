import { randomUUID } from "node:crypto";
/**
 * E2E du **visa des commandes** (plan
 * `documentation/commandes/back-office/plan-visa-des-commandes.md`, V2 et V4).
 *
 * Ce que seul le vrai SQL prouve : l'onglet « À vérifier » ne montre que le
 * périmètre (pro passée seule, après la mise en service, sans visa en cours
 * ou révisée depuis) ; viser, retirer, viser à nouveau garde l'historique ;
 * la porte refuse qui n'a pas le droit ; et viser acquitte les alertes de la
 * commande par la boîte d'envoi.
 */
import {
  type AccountAlertView,
  type AdminOrderView,
  type AdminOrdersPage,
  type RoleGrant,
} from "@lfd/contracts";
import type request from "supertest";

import { CompanyStatus, CustomerRole } from "../src/platform/database/client/client.js";
import { CardProviders } from "../src/payment/card/domain/ports/card-providers.js";
import { ORDER_REVIEW_STARTS_AT } from "../src/lafoliecoffee/orders/domain/services/order-review-start.js";
import { OutboxRelayTrigger } from "../src/platform/outbox/outbox-relay-trigger.js";
import { relayAll, SILENT_TRIGGER } from "./catalog-facts-scene.js";
import { ADMIN_VERIFIER_OVERRIDE } from "./delivery-rounds-scene.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble } from "./order-factory.js";

const SERVICE_DAY = serviceDay();
const MEMBER = "auth0|review-member";
const SOLO = "auth0|review-solo";
/** Instants tirés de la mise en service : comparés à elle, jamais à l'horloge. */
const AFTER_START = new Date(ORDER_REVIEW_STARTS_AT.getTime() + 60_000);
const BEFORE_START = new Date(ORDER_REVIEW_STARTS_AT.getTime() - 1);

let ctx: E2eContext;
let pickupId = "pickup_absent";

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      ADMIN_VERIFIER_OVERRIDE,
      { token: CardProviders, value: cardGatewayDouble("pi_review") },
      { token: OutboxRelayTrigger, value: SILENT_TRIGGER },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): request.Agent => ctx.asSub(E2E_STAFF_SUB);

async function seedPlaces(): Promise<void> {
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
}

async function place(sub: string, companyId: string | null): Promise<string> {
  const response = await ctx
    .asSub(sub)
    .post("/orders")
    .send({
      idempotencyKey: randomUUID(),
      salesTerms: null,
      requestedDeliveryDate: SERVICE_DAY,
      lines: [{ sku: "VIE-001-1", quantity: 1 }],
      companyId,
      fulfillmentMethod: "pickup",
      requestedWindow: { start: "07:00", end: "08:00" },
      pickupAddressId: pickupId,
    })
    .expect(201);
  const { orderNumber } = jsonBody<{ orderNumber: string }>(response);
  // Passée après la mise en service, quel que soit le jour où la suite tourne.
  const order = await ctx.prisma.order.update({
    where: { orderNumber },
    data: { createdAt: AFTER_START },
    select: { id: true },
  });
  return order.id;
}

/** Une commande pro passée seule, et une d'une particulière. */
async function seedScene(): Promise<{ pro: string; companyId: string; solo: string }> {
  await seedPlaces();
  const company = await createCompany(ctx.prisma, {
    raisonSociale: "Café des Halles SAS",
    status: CompanyStatus.active,
  });
  const member = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  await attachTo(ctx.prisma, member.id, company.id, CustomerRole.owner);
  await createUser(ctx.prisma, { auth0Sub: SOLO, email: "solo@exemple.fr" });
  const pro = await place(MEMBER, company.id);
  const solo = await place(SOLO, null);
  await ctx.prisma.order.update({ where: { id: solo }, data: { paymentStatus: "paid" } });
  return { pro, companyId: company.id, solo };
}

async function toReview(): Promise<string[]> {
  const page = jsonBody<AdminOrdersPage>(
    await staff().get("/admin/orders?view=to_review").expect(200),
  );
  return page.rows.map((row) => row.id);
}

const review = (orderId: string, note?: string) =>
  staff()
    .post(`/admin/orders/${orderId}/review`)
    .set("Idempotency-Key", randomUUID())
    .send(note === undefined ? {} : { note });

const withdraw = (orderId: string) =>
  staff()
    .post(`/admin/orders/${orderId}/review/withdraw`)
    .set("Idempotency-Key", randomUUID())
    .send({});

async function detail(orderId: string): Promise<AdminOrderView> {
  return jsonBody<AdminOrderView>(await staff().get(`/admin/orders/${orderId}`).expect(200));
}

describe("Le visa des commandes", () => {
  it("l'onglet ne montre que la commande pro passée seule après la mise en service", async () => {
    const { pro, companyId } = await seedScene();
    const before = await place(MEMBER, companyId);
    await ctx.prisma.order.update({ where: { id: before }, data: { createdAt: BEFORE_START } });

    expect(await toReview()).toEqual([pro]);
    expect((await detail(before)).review?.reviewable).toBe(false);
  });

  it("viser, retirer, viser à nouveau : l'onglet suit, l'historique garde tout", async () => {
    const { pro } = await seedScene();

    await review(pro, "RAS").expect(204);
    expect(await toReview()).toEqual([]);
    const reviewed = await detail(pro);
    expect(reviewed.review).toMatchObject({
      reviewable: false,
      revisedSinceReview: false,
      current: { note: "RAS", withdrawn: null },
    });
    await review(pro).expect(409);

    await withdraw(pro).expect(204);
    expect(await toReview()).toEqual([pro]);
    await withdraw(pro).expect(409);

    await review(pro).expect(204);
    const again = await detail(pro);
    expect(again.review?.history).toHaveLength(2);
    expect(again.review?.history[1]?.withdrawn).not.toBeNull();
    const rows = await ctx.prisma.orderReview.findMany({ where: { orderId: pro } });
    expect(rows.map((row) => row.reviewedByStaffId)).toEqual([E2E_STAFF_ID, E2E_STAFF_ID]);
  });

  it("viser à nouveau une commande révisée remplace le visa en un geste ; non révisée, 409", async () => {
    const { pro } = await seedScene();
    await review(pro).expect(204);
    await review(pro).expect(409);
    await ctx.prisma.order.update({ where: { id: pro }, data: { revision: { increment: 1 } } });

    await review(pro, "revue après modification").expect(204);

    const rows = await ctx.prisma.orderReview.findMany({
      where: { orderId: pro },
      orderBy: { reviewedRevision: "asc" },
    });
    expect(rows.map((row) => [row.reviewedRevision, row.withdrawnByStaffId])).toEqual([
      [0, E2E_STAFF_ID],
      [1, null],
    ]);
    expect(await toReview()).toEqual([]);
    await relayAll(ctx);
    const journal = await ctx.prisma.activityEvent.findMany({
      where: { type: { in: ["order.reviewed", "order.review_withdrawn"] } },
      select: { type: true },
    });
    expect(journal.map((row) => row.type).sort()).toEqual([
      "order.review_withdrawn",
      "order.reviewed",
      "order.reviewed",
    ]);
  });

  it("une commande révisée après son visa revient dans l'onglet, « modifiée depuis »", async () => {
    const { pro } = await seedScene();
    await review(pro).expect(204);

    await ctx.prisma.order.update({ where: { id: pro }, data: { revision: { increment: 1 } } });

    expect(await toReview()).toEqual([pro]);
    const page = jsonBody<AdminOrdersPage>(await staff().get("/admin/orders").expect(200));
    const row = page.rows.find((candidate) => candidate.id === pro);
    expect(row?.revisedSinceReview).toBe(true);
    expect(row?.review).not.toBeNull();
  });

  it("refuse de viser la commande d'une particulière", async () => {
    const { solo } = await seedScene();

    await review(solo).expect(409);
  });

  it("refuse en 400 un geste sans clé d'intention", async () => {
    const { pro } = await seedScene();

    await staff().post(`/admin/orders/${pro}/review`).send({}).expect(400);
  });

  it("viser acquitte les alertes en attente de la commande, au nom de qui l'a visée", async () => {
    const { pro, companyId } = await seedScene();
    const { orderNumber } = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: pro },
      select: { orderNumber: true },
    });
    await ctx.prisma.accountAlert.create({
      data: {
        id: "alert_1",
        companyId,
        kind: "product.first_order",
        orderId: pro,
        orderNumber,
        idempotencyKey: `product.first_order:${pro}`,
        occurredAt: AFTER_START,
        findings: [],
      },
    });
    const pending = jsonBody<AccountAlertView[]>(
      await staff().get(`/admin/alerts?orderIds=${pro},absente`).expect(200),
    );
    expect(pending.map((alert) => [alert.id, alert.acknowledgedAt])).toEqual([["alert_1", null]]);

    await review(pro).expect(204);
    await relayAll(ctx);

    const after = jsonBody<AccountAlertView[]>(
      await staff().get(`/admin/alerts?orderIds=${pro}`).expect(200),
    );
    expect(after[0]?.acknowledgedBy).toBe(E2E_STAFF_ID);
  });
});

describe("Le visa des commandes — la porte", () => {
  async function holderOf(key: string, grants: readonly RoleGrant[]): Promise<request.Agent> {
    await staff().post("/admin/staff-roles").send({ key, label: key, grants }).expect(201);
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

  it("refuse le geste et l'onglet à qui lit les commandes sans le droit du visa", async () => {
    const { pro } = await seedScene();
    const agent = await holderOf("lecteur-commandes", [{ resource: "b2b_orders", action: "read" }]);

    await agent
      .post(`/admin/orders/${pro}/review`)
      .set("Idempotency-Key", randomUUID())
      .send({})
      .expect(403);
    await agent.get("/admin/orders?view=to_review").expect(403);
    await agent.get("/admin/orders").expect(200);
  });
});
