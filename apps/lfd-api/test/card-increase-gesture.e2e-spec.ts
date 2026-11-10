/**
 * **Le geste de la hausse payée par carte, sur le vrai Postgres** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.3).
 *
 * Ce que seul le vrai chemin prouve : la hausse demandée naît en projet
 * `awaiting_payment` avec sa ligne de paiement `complement` dans la MÊME
 * transaction, et la commande ne bouge pas ; un total vu faux ne crée aucune
 * intention ; le mur de la commande tient sur le complément ; le remplacement
 * et l'abandon passent par l'écriture conditionnée ; la demande M4 reste
 * fermée à une carte (R4) ; le devis annonce le complément (R3).
 *
 * Seules frontières doublées : la signature des jetons (le jeton EST le `sub`)
 * et le prestataire de carte (`E2eCardProvider`).
 */
import {
  ORDER_TOTAL_CHANGED,
  type CardComplementPaymentView,
  type OrderRevisionQuoteView,
  type RequestReasonPayload,
} from "@lfd/contracts";

import { CardPayments } from "../src/card-payment/channels/requests/index.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { CardIncreaseProposal } from "../src/b2b/orders/revision/domain/entities/card-increase-proposal.js";
import { CardIncreaseProposalRepository } from "../src/b2b/orders/revision/domain/ports/card-increase-proposal.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { cardProvidersDouble } from "./card-payments.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { payByCard, pickupSite, placeOrder } from "./order-factory.js";

const DAY = serviceDay(7);
const BUYER = "auth0|hausse-geste";
const OUTSIDER = "auth0|hausse-etranger";
const cards = cardProvidersDouble("pi_geste");

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: CardProviders, value: cards },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const buyer = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(BUYER);
const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

interface PaidOrder {
  readonly id: string;
  readonly pickupId: string;
  readonly totalCents: number;
}

/** La commande voulue : un retrait au point de la commande, `DAY`, `quantity` croissants. */
function content(pickupId: string, quantity: number, note = ""): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note,
    lines: [{ sku: "VIE-001-1", quantity }],
  };
}

/** Une commande personnelle de 3 croissants, payée par carte, par le vrai chemin. */
async function paidOrder(): Promise<PaidOrder> {
  const user = await createUser(ctx.prisma, { auth0Sub: BUYER, firstName: "Léa" });
  const pickupId = await pickupSite(ctx.prisma);
  const order = await placeOrder(ctx, {
    buyerUserId: user.id,
    forDay: DAY,
    fulfillment: { method: "pickup", pickupSiteId: pickupId },
  });
  await payByCard(ctx, order);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true, paymentStatus: true },
  });
  expect(row.paymentStatus).toBe("paid");
  return { id: order.id, pickupId, totalCents: row.totalCents };
}

/** Le devis de la boutique pour `quantity` croissants. */
async function quote(order: PaidOrder, quantity: number): Promise<OrderRevisionQuoteView> {
  return jsonBody<OrderRevisionQuoteView>(
    await buyer()
      .post(`/orders/${order.id}/revisions/quote`)
      .send(content(order.pickupId, quantity))
      .expect(200),
  );
}

function propose(order: PaidOrder, quantity: number, expectedTotalCents: number, note = "") {
  return buyer()
    .post(`/orders/${order.id}/revisions/card-increase`)
    .send({ expectedRevision: 0, expectedTotalCents, ...content(order.pickupId, quantity, note) });
}

/** La hausse demandée au total du devis, réussie. */
async function proposed(order: PaidOrder, quantity = 6): Promise<CardComplementPaymentView> {
  const seen = await quote(order, quantity);
  return jsonBody<CardComplementPaymentView>(
    await propose(order, quantity, seen.totalCents).expect(200),
  );
}

async function proposalsOf(orderId: string) {
  return ctx.prisma.orderRevisionProposal.findMany({
    where: { orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true, state: true, paymentId: true, complementCents: true },
  });
}

async function journalOf(orderId: string): Promise<string[]> {
  const rows = await ctx.prisma.activityEvent.findMany({
    where: { subjectId: orderId, type: { startsWith: "order.card_increase" } },
    orderBy: { occurredAt: "asc" },
    select: { type: true },
  });
  return rows.map((row) => row.type);
}

describe("La hausse demandée (§2.4)", () => {
  it("le devis annonce le complément ; la hausse naît en projet, la commande reste intacte", async () => {
    const order = await paidOrder();
    const seen = await quote(order, 6);
    expect(seen.settlement).toEqual({
      kind: "card_complement",
      complementCents: seen.totalCents - order.totalCents,
    });

    const answer = jsonBody<CardComplementPaymentView>(
      await propose(order, 6, seen.totalCents).expect(200),
    );

    expect(answer).toMatchObject({
      complementCents: seen.totalCents - order.totalCents,
      publishableKey: expect.any(String) as string,
      clientSecret: expect.any(String) as string,
    });
    const [proposal] = await proposalsOf(order.id);
    expect(proposal).toMatchObject({ id: answer.proposalId, state: "awaiting_payment" });
    const line = await ctx.prisma.cardPayment.findUniqueOrThrow({
      where: { id: proposal?.paymentId ?? "" },
      select: { role: true, state: true, amountCents: true, subjectId: true },
    });
    expect(line).toEqual({
      role: "complement",
      state: "pending",
      amountCents: answer.complementCents,
      subjectId: order.id,
    });
    const after = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { totalCents: true, revision: true, paymentStatus: true },
    });
    expect(after).toEqual({ totalCents: order.totalCents, revision: 0, paymentStatus: "paid" });
    expect(await journalOf(order.id)).toEqual(["order.card_increase_proposed"]);
  });

  it("R14 : un total vu faux est refusé (409) sans qu'aucune intention soit créée", async () => {
    const order = await paidOrder();
    const seen = await quote(order, 6);

    const refused = await propose(order, 6, seen.totalCents - 1).expect(409);

    expect(refused.body).toMatchObject({ code: ORDER_TOTAL_CHANGED });
    expect(await proposalsOf(order.id)).toEqual([]);
    expect(await ctx.prisma.cardPayment.count({ where: { subjectId: order.id } })).toBe(1);
  });

  it.each([
    ["une baisse", 2, ""],
    ["un total égal", 3, "porte B"],
  ] as const)(
    "plan S1 : refuse %s par le complément — elle se valide directement",
    async (_, quantity, note) => {
      const order = await paidOrder();

      const refused = await propose(order, quantity, order.totalCents, note).expect(409);

      expect(refused.body).toMatchObject({ code: "orders.card_increase.not_card" });
      expect(JSON.stringify(refused.body)).toContain("ne fait pas monter le total");
      expect(await proposalsOf(order.id)).toEqual([]);
    },
  );

  it("R15 : l'équipe qui augmente une commande carte est refusée, avec le geste de sortie", async () => {
    const order = await paidOrder();

    const refused = await staff()
      .post(`/admin/orders/${order.id}/revisions`)
      .send({ expectedRevision: 0, ...content(order.pickupId, 6) })
      .expect(409);

    expect(refused.body).toMatchObject({ code: "orders.revise.card_settled" });
    expect(JSON.stringify(refused.body)).toContain("Demandez au client de modifier sa commande");
  });

  it("le même auteur remplace son complément en attente : l'ancien abandonné, son intention fermée", async () => {
    const order = await paidOrder();
    const first = await proposed(order, 6);

    const second = await proposed(order, 8);

    const rows = await proposalsOf(order.id);
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      [first.proposalId, "abandoned"],
      [second.proposalId, "awaiting_payment"],
    ]);
    const old = await ctx.prisma.cardPayment.findUniqueOrThrow({
      where: { id: rows[0]?.paymentId ?? "" },
      select: { state: true },
    });
    expect(old.state).toBe("closed");
    expect(await journalOf(order.id)).toEqual([
      "order.card_increase_proposed",
      "order.card_increase_abandoned",
      "order.card_increase_proposed",
    ]);
  });

  it("R5 : un autre auteur pendant un complément en attente est refusé, jamais l'index brut", async () => {
    const order = await paidOrder();
    const payments = ctx.app.get(CardPayments);
    const { prepared } = await payments.prepare("order", 1_200, "personal");
    await ctx.app.get(UnitOfWork).run(async () => {
      const attached = await payments.attach(
        { type: "order", id: order.id },
        prepared,
        "complement",
      );
      await ctx.app.get(CardIncreaseProposalRepository).save(
        CardIncreaseProposal.propose({
          id: "prop_autre",
          orderId: order.id,
          baseRevision: 0,
          content: {},
          rules: { rulesOf: "customer" },
          totalBeforeCents: order.totalCents,
          targetTotalCents: order.totalCents + 1_200,
          author: { kind: "customer", userId: "usr_autre" },
          paymentId: attached.paymentId,
          now: new Date(0),
          cutoff: null,
        }),
      );
    });
    const seen = await quote(order, 6);

    const refused = await propose(order, 6, seen.totalCents).expect(409);

    expect(refused.body).toMatchObject({ code: "orders.card_increase.pending" });
  });
});

describe("Le complément : relire, abandonner (§2.5)", () => {
  it("GET complement : relu chez le prestataire ; hors mur, 404", async () => {
    const order = await paidOrder();
    const answer = await proposed(order);
    await createUser(ctx.prisma, { auth0Sub: OUTSIDER, firstName: "Max" });

    const read = jsonBody<CardComplementPaymentView>(
      await buyer().get(`/orders/${order.id}/complement`).expect(200),
    );

    expect(read).toEqual(answer);
    await ctx.asSub(OUTSIDER).get(`/orders/${order.id}/complement`).expect(404);
  });

  it("DELETE complement par le client : abandonné, rien à payer ensuite, la commande intacte", async () => {
    const order = await paidOrder();
    await proposed(order);

    await buyer().delete(`/orders/${order.id}/complement`).expect(204);

    const [proposal] = await proposalsOf(order.id);
    expect(proposal?.state).toBe("abandoned");
    const read = await buyer().get(`/orders/${order.id}/complement`).expect(409);
    expect(read.body).toMatchObject({ code: "orders.card_increase.nothing_to_pay" });
    expect(await journalOf(order.id)).toEqual([
      "order.card_increase_proposed",
      "order.card_increase_abandoned",
    ]);
  });

  it("DELETE admin complement : l'équipe abandonne depuis la fiche", async () => {
    const order = await paidOrder();
    await proposed(order);

    await staff().delete(`/admin/orders/${order.id}/complement`).expect(204);

    const [proposal] = await proposalsOf(order.id);
    expect(proposal?.state).toBe("abandoned");
  });
});

describe("La commande carte vue par la boutique et par la demande M4 (R2 ter, R4)", () => {
  const CHANGE_REASON: RequestReasonPayload = {
    kind: "order_change",
    label: { fr: "Modifier ma commande", en: "", it: "" },
    recipientEmail: "commandes@lfc.test",
    position: 0,
    active: true,
    audience: "both",
    priority: "medium",
  };

  it("plan S1, R12 — la boutique : simplement modifiable, sans `cardIncreaseOnly`", async () => {
    const order = await paidOrder();

    const view = await buyer().get(`/orders/${order.id}`).expect(200);

    expect(JSON.stringify(view.body)).toContain('"revisable":true');
    expect(JSON.stringify(view.body)).not.toContain("cardIncreaseOnly");
  });

  it("la demande M4 sur une carte, l'heure limite passée, ne se dépose pas", async () => {
    const order = await paidOrder();
    await staff().post("/admin/request-reasons").send(CHANGE_REASON).expect(201);
    await ctx.prisma.orderCutoff.create({
      data: { pickupAddressId: null, weekday: null, daysBefore: 8, time: "00:00", graceMinutes: 0 },
    });

    await buyer()
      .post(`/me/orders/${order.id}/change-request`)
      .send({
        change: { expectedRevision: 0, ...content(order.pickupId, 6) },
        message: "Trois de plus, s'il vous plaît.",
      })
      .expect(409);
  });
});
