/**
 * E2E de **la demande de modification après l'heure limite** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §4, M4) :
 * `POST /me/orders/:id/change-request` (client), puis la boîte des demandes
 * — `GET …/order-change/quote`, `POST …/apply`, `POST …/refuse` (équipe,
 * `b2b_contact`).
 *
 * Ce que seul le vrai chemin prouve : que « trop tard » est jugé par LA règle
 * de la modification (l'heure limite en base), qu'appliquer EST une révision
 * (lignes réécrites, révision montée, historique tenu) dans la même
 * transaction que la réponse, qu'une commande inscrite au fournil entre-temps
 * refuse l'application et laisse la demande en attente, le mur du client, et
 * le droit de la boîte.
 *
 * Le devis INDICATIF du client (`POST /orders/:id/revisions/change-request-quote`,
 * §14) : admis au seul « trop tard », derrière le mur.
 *
 * Doublés : la signature des jetons (le jeton EST le `sub`), Stripe, le mailer.
 */
import type {
  AdminPlacedOrderResponse,
  CreatedIdResponse,
  CustomerRequestView,
  OrderChangeRequestStatusResponse,
  OrderRevisionQuoteView,
  RequestReasonPayload,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  CompanyStatus,
  CustomerRole,
  DeferredTerm,
} from "../src/platform/database/client/client.js";
import { MAILER } from "../src/platform/mailer/mailer.tokens.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";

const DAY = serviceDay(7);
const BUYER = "auth0|acheteur-demande-modif";
const OUTSIDER = "auth0|etranger-demande-modif";

interface SentMail {
  readonly to: string;
  readonly template: string;
  readonly data: Record<string, unknown>;
}
const sentMails: SentMail[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: SentMail): Promise<{ providerId: null }> => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

const fakeGateway = {
  createIntent: () => Promise.resolve({ paymentIntentId: "pi_x", clientSecret: "pi_x_secret" }),
  retrieveIntent: (id: string) =>
    Promise.resolve({
      paymentIntentId: id,
      clientSecret: `${id}_secret`,
      state: "awaiting_payment",
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
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sentMails.splice(0);
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);
const buyer = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(BUYER);

const CHANGE_REASON: RequestReasonPayload = {
  kind: "order_change",
  label: { fr: "Modifier ma commande", en: "", it: "" },
  recipientEmail: "commandes@lfc.test",
  position: 0,
  active: true,
  audience: "both",
  priority: "medium",
};

interface Scene {
  readonly orderId: string;
  readonly pickupId: string;
}

/** La commande voulue : un retrait au Labo, `DAY`, 10 croissants par défaut. */
function content(pickupId: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
    lines: [{ sku: "VIE-001", quantity: 10 }],
    ...over,
  };
}

/**
 * Un point de retrait, une société au compte, son acheteur, sa commande de 10
 * croissants saisie par l'équipe — et, sauf `late: false`, l'heure limite du
 * jour de service tombée (huit jours avant, à minuit) : la commande est
 * « trop tard » pour le client, pas encore au plan.
 */
async function scene(late = true): Promise<Scene> {
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
  const company = await createCompany(ctx.prisma, { status: CompanyStatus.active });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: [DeferredTerm.monthly] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER, email: "acheteur@test.fr" });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  const placed = jsonBody<AdminPlacedOrderResponse>(
    await staff()
      .post("/admin/orders")
      .send({
        companyId: company.id,
        buyerUserId: user.id,
        settlement: "account",
        ...content(point.id),
      })
      .expect(201),
  );
  await staff().post("/admin/request-reasons").send(CHANGE_REASON).expect(201);
  if (late) {
    await ctx.prisma.orderCutoff.create({
      data: { pickupAddressId: null, weekday: null, daysBefore: 8, time: "00:00", graceMinutes: 0 },
    });
  }
  return { orderId: placed.id, pickupId: point.id };
}

function ask(sub: string, scene: Scene, quantity = 12, revision = 0) {
  return ctx
    .asSub(sub)
    .post(`/me/orders/${scene.orderId}/change-request`)
    .send({
      change: {
        expectedRevision: revision,
        ...content(scene.pickupId, { lines: [{ sku: "VIE-001", quantity }] }),
      },
      message: "Deux de plus, s'il vous plaît.",
    });
}

async function requested(s: Scene): Promise<string> {
  return jsonBody<CreatedIdResponse>(await ask(BUYER, s).expect(201)).id;
}

async function staffOfRole(role: "communication"): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

const quantities = (orderId: string) =>
  ctx.prisma.orderLine.findMany({ where: { orderId }, select: { sku: true, quantity: true } });

describe("POST /me/orders/:id/change-request — le client demande", () => {
  it("après l'heure limite : rangée dans la boîte, en attente, la commande intacte", async () => {
    const s = await scene();
    const id = await requested(s);

    const pending = jsonBody<CustomerRequestView[]>(
      await staff().get("/admin/customer-requests?status=pending&kind=order_change").expect(200),
    );
    expect(pending.map((r) => r.id)).toEqual([id]);
    expect(pending[0]?.details).toMatchObject({
      kind: "order_change",
      orderId: s.orderId,
      baseRevision: 0,
      change: { lines: [{ sku: "VIE-001", quantity: 12 }] },
      decision: null,
    });
    expect(await quantities(s.orderId)).toEqual([{ sku: "VIE-001", quantity: 10 }]);

    const status = jsonBody<OrderChangeRequestStatusResponse>(
      await buyer().get(`/me/orders/${s.orderId}/change-request`).expect(200),
    );
    expect(status.request).toMatchObject({ id, status: "pending", refusalReason: null });
    expect(sentMails.map((m) => m.template)).toContain("staff.customer-request");
  });

  it("avant l'heure limite : refusée — le client modifie lui-même", async () => {
    const s = await scene(false);
    const refused = await ask(BUYER, s).expect(409);
    expect(JSON.stringify(refused.body)).toContain("Modifier ma commande");
    expect(await ctx.prisma.customerRequest.count()).toBe(0);
  });

  it("une seconde demande attend la première (409)", async () => {
    const s = await scene();
    await requested(s);
    await ask(BUYER, s).expect(409);
    expect(await ctx.prisma.customerRequest.count()).toBe(1);
  });

  it("le mur : un client d'une autre maison ne trouve pas la commande (404)", async () => {
    const s = await scene();
    await createUser(ctx.prisma, { auth0Sub: OUTSIDER, email: "etranger@test.fr" });
    await ask(OUTSIDER, s).expect(404);
    await ctx.asSub(OUTSIDER).get(`/me/orders/${s.orderId}/change-request`).expect(404);
    expect(await ctx.prisma.customerRequest.count()).toBe(0);
  });
});

describe("POST /orders/:id/revisions/change-request-quote — le devis indicatif de la demande", () => {
  const quoteAs = (sub: string, s: Scene, quantity = 12) =>
    ctx
      .asSub(sub)
      .post(`/orders/${s.orderId}/revisions/change-request-quote`)
      .send(content(s.pickupId, { lines: [{ sku: "VIE-001", quantity }] }));

  it("après l'heure limite : le nouveau total et l'écart, sans rien écrire", async () => {
    const s = await scene();
    const quote = jsonBody<OrderRevisionQuoteView>(await quoteAs(BUYER, s).expect(200));

    expect(quote).toMatchObject({ revision: 0, changes: ["lines"] });
    expect(quote.differenceCents).toBe(quote.totalCents - quote.previousTotalCents);
    expect(quote.differenceCents).toBeGreaterThan(0);
    expect(quote.lines[0]).toMatchObject({ sku: "VIE-001", quantity: 12, priceFrozen: true });
    expect(await quantities(s.orderId)).toEqual([{ sku: "VIE-001", quantity: 10 }]);
    expect(await ctx.prisma.customerRequest.count()).toBe(0);
  });

  it("avant l'heure limite : refusé (409) — le client modifie lui-même", async () => {
    const s = await scene(false);
    const refused = await quoteAs(BUYER, s).expect(409);
    expect(JSON.stringify(refused.body)).toContain("Modifier ma commande");
  });

  it("le mur : un client d'une autre société ne trouve pas la commande (404)", async () => {
    const s = await scene();
    const other = await createCompany(ctx.prisma, { status: CompanyStatus.active });
    const outsider = await createUser(ctx.prisma, {
      auth0Sub: OUTSIDER,
      email: "etranger@test.fr",
    });
    await attachTo(ctx.prisma, outsider.id, other.id, CustomerRole.owner);
    await quoteAs(OUTSIDER, s).expect(404);
  });
});

describe("la boîte des demandes — l'équipe répond", () => {
  it("l'écart, puis « Appliquer » : une révision au nom de l'équipe, la demande répondue", async () => {
    const s = await scene();
    const id = await requested(s);

    const quote = jsonBody<OrderRevisionQuoteView>(
      await staff().get(`/admin/customer-requests/${id}/order-change/quote`).expect(200),
    );
    expect(quote).toMatchObject({ revision: 0, changes: ["lines"] });
    expect(quote.differenceCents).toBeGreaterThan(0);

    const applied = await staff()
      .post(`/admin/customer-requests/${id}/order-change/apply`)
      .expect(200);
    expect(jsonBody<{ revision: number }>(applied).revision).toBe(1);

    expect(await quantities(s.orderId)).toEqual([{ sku: "VIE-001", quantity: 12 }]);
    const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: s.orderId } });
    expect(order.revision).toBe(1);
    expect(await ctx.prisma.orderRevisionEntry.count({ where: { orderId: s.orderId } })).toBe(1);
    const row = await ctx.prisma.customerRequest.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ changeAppliedRevision: 1, changeRefusal: null });
    expect(row.handledAt).not.toBeNull();
    const status = jsonBody<OrderChangeRequestStatusResponse>(
      await buyer().get(`/me/orders/${s.orderId}/change-request`).expect(200),
    );
    expect(status.request?.status).toBe("applied");
    expect(await ctx.prisma.activityEvent.count({ where: { type: "order.change_applied" } })).toBe(
      1,
    );

    // Répondue, elle ne se répond plus.
    await staff().post(`/admin/customer-requests/${id}/order-change/apply`).expect(409);
  });

  it("« Refuser » avec un mot : la commande intacte, le client lit le mot", async () => {
    const s = await scene();
    const id = await requested(s);

    await staff()
      .post(`/admin/customer-requests/${id}/order-change/refuse`)
      .send({ reason: "La fournée est déjà lancée." })
      .expect(204);

    expect(await quantities(s.orderId)).toEqual([{ sku: "VIE-001", quantity: 10 }]);
    const status = jsonBody<OrderChangeRequestStatusResponse>(
      await buyer().get(`/me/orders/${s.orderId}/change-request`).expect(200),
    );
    expect(status.request).toMatchObject({
      status: "refused",
      refusalReason: "La fournée est déjà lancée.",
    });
    // Une nouvelle demande est de nouveau possible.
    await ask(BUYER, s).expect(201);
  });

  it("un refus sans mot est refusé (400)", async () => {
    const s = await scene();
    const id = await requested(s);
    await staff()
      .post(`/admin/customer-requests/${id}/order-change/refuse`)
      .send({ reason: "   " })
      .expect(400);
  });

  it("inscrite au fournil entre-temps : « Appliquer » refusé, l'écran le dit, la demande reste en attente", async () => {
    const s = await scene();
    const id = await requested(s);
    // Une heure limite posée interdit d'arrêter le plan à la main avant celle du
    // réassort : on la retire, la demande déjà rangée, pour inscrire la journée.
    await ctx.prisma.orderCutoff.deleteMany();
    await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
    await ctx.drain();

    const quote = await staff()
      .get(`/admin/customer-requests/${id}/order-change/quote`)
      .expect(409);
    expect(JSON.stringify(quote.body)).toContain("Le fournil a déjà inscrit cette commande");
    await staff().post(`/admin/customer-requests/${id}/order-change/apply`).expect(409);

    expect(await quantities(s.orderId)).toEqual([{ sku: "VIE-001", quantity: 10 }]);
    const row = await ctx.prisma.customerRequest.findUniqueOrThrow({ where: { id } });
    expect(row.handledAt).toBeNull();
    // Elle se refuse encore.
    await staff()
      .post(`/admin/customer-requests/${id}/order-change/refuse`)
      .send({ reason: "Déjà en préparation." })
      .expect(204);
  });

  it("« Marquer traité » ne s'applique pas à une demande de modification (409)", async () => {
    const s = await scene();
    const id = await requested(s);
    await staff().post(`/admin/customer-requests/${id}/handled`).expect(409);
  });

  it("sans le droit de la boîte : ni l'écart, ni « Appliquer », ni « Refuser » (403)", async () => {
    const s = await scene();
    const id = await requested(s);
    const outsider = await staffOfRole("communication");

    await outsider.get(`/admin/customer-requests/${id}/order-change/quote`).expect(403);
    await outsider.post(`/admin/customer-requests/${id}/order-change/apply`).expect(403);
    await outsider
      .post(`/admin/customer-requests/${id}/order-change/refuse`)
      .send({ reason: "Non." })
      .expect(403);
    expect(await quantities(s.orderId)).toEqual([{ sku: "VIE-001", quantity: 10 }]);
  });
});
