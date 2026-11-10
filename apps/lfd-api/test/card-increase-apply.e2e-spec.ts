/**
 * **Appliquer et rendre une hausse payée par carte, sur le vrai Postgres**
 * (doc `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5).
 *
 * Ce que seul le vrai chemin prouve : le webhook d'un complément réveille
 * l'exécuteur après validation, qui écrit la révision par le même chemin que
 * M1 — et la facture carte tient (encaissé − ajusté = total) ; un refus
 * (journée arrêtée entre-temps) rend le complément en AJUSTEMENT après
 * validation et prévient le client ; un complément payé après l'abandon est
 * rendu ; le délai abandonne, ou rattrape un paiement déjà fait ; le
 * balayage rattrape un webhook perdu ; « Relancer » reprend un projet en
 * panne ; l'annulation de la commande traite chaque état du projet (R9).
 *
 * Frontières doublées : la signature des jetons (le jeton EST le `sub`) et
 * le prestataire de carte (`E2eCardProvider`). Le mur avance par
 * `OffsetWallClock` : aucune date absolue comparée à l'horloge.
 */
import type {
  AdminOrderView,
  CardComplementPaymentView,
  OrderRevisionQuoteView,
} from "@lfd/contracts";

import { CardSettlementReader } from "../src/card-payment/channels/requests/index.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { b2bMailTemplates, type B2bMails } from "../src/mail/templates/mail-templates.js";
import { CardIncreaseProposalRepository } from "../src/b2b/orders/revision/domain/ports/card-increase-proposal.repository.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { WallClock } from "../src/platform/time/wall-clock.js";
import { cardPaid, cardProvidersDouble } from "./card-payments.js";
import {
  bootstrapE2e,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { payByCard, pickupSite, placeOrder } from "./order-factory.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const DAY = serviceDay(7);
const BUYER = "auth0|hausse-appliquee";
const MINUTE_MS = 60_000;
const cards = cardProvidersDouble("pi_appli");

/** Le mur, décalé à la main : le délai de paiement et le bail s'y comparent. */
class OffsetWallClock extends WallClock {
  offsetMs = 0;

  elapsedNow(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}
const wall = new OffsetWallClock();

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

/** Les e-mails partis, relevés pour « commande modifiée » (2026-11-10). */
const sentMails: { readonly template: string; readonly data: unknown }[] = [];
const recordingMailer = {
  enabled: true,
  send: (args: { readonly template: string; readonly data: unknown }) => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: CardProviders, value: cards },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: WallClock, value: wall },
      { token: MAILER, value: recordingMailer },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  wall.offsetMs = 0;
  sentMails.splice(0);
  cards.provider.cancellation = { kind: "cancelled" };
  cards.provider.states.clear();
});

const buyer = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(BUYER);
const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

interface PaidOrder {
  readonly id: string;
  readonly pickupId: string;
  readonly totalCents: number;
}

interface Proposed extends CardComplementPaymentView {
  readonly targetCents: number;
  readonly providerRef: string;
}

function content(pickupId: string, quantity: number): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note: "",
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
    select: { totalCents: true },
  });
  return { id: order.id, pickupId, totalCents: row.totalCents };
}

/** La hausse demandée au total du devis, par la route du client. */
async function proposed(order: PaidOrder, quantity = 6): Promise<Proposed> {
  const seen = jsonBody<OrderRevisionQuoteView>(
    await buyer()
      .post(`/orders/${order.id}/revisions/quote`)
      .send(content(order.pickupId, quantity))
      .expect(200),
  );
  const answer = jsonBody<CardComplementPaymentView>(
    await buyer()
      .post(`/orders/${order.id}/revisions/card-increase`)
      .send({
        expectedRevision: 0,
        expectedTotalCents: seen.totalCents,
        ...content(order.pickupId, quantity),
      })
      .expect(200),
  );
  const providerRef = cards.provider.issued.at(-1) ?? "";
  return { ...answer, targetCents: seen.totalCents, providerRef };
}

/** La boîte d'envoi livrée, puis les tâches de fond attendues — deux fois : un abonné en publie. */
async function deliver(): Promise<void> {
  for (let round = 0; round < 2; round += 1) {
    await ctx.app.get(OutboxRelay).sweep();
    await ctx.drain();
  }
}

const machine = (path: string) =>
  ctx.http().post(path).set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN).expect(200);

async function proposalOf(proposalId: string) {
  return ctx.prisma.orderRevisionProposal.findUniqueOrThrow({
    where: { id: proposalId },
    select: { state: true, refusal: true, attempts: true, providerChecks: true },
  });
}

async function orderOf(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { totalCents: true, revision: true, status: true, paymentStatus: true },
  });
}

async function refundRequestsOf(orderId: string) {
  return ctx.prisma.cardRefundRequest.findMany({
    where: { payment: { subjectId: orderId } },
    orderBy: { requestedAt: "asc" },
    select: { form: true, nature: true, reason: true, announcedCents: true, paymentId: true },
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

/** La facture carte tient : encaissé − remboursé en ajustement = total de la commande. */
async function cardInvoiceHolds(orderId: string): Promise<void> {
  const [position] = await ctx.app
    .get(CardSettlementReader)
    .positionOf([{ type: "order", id: orderId }]);
  const order = await orderOf(orderId);
  expect((position?.chargedCents ?? 0) - (position?.refundedByNature.adjustment ?? 0)).toBe(
    order.totalCents,
  );
}

/** Passe le projet `stalled` par l'agrégat : cinq pannes, comme l'exécuteur les écrirait. */
async function stall(orderId: string): Promise<void> {
  await ctx.app.get(UnitOfWork).run(async () => {
    const repository = ctx.app.get(CardIncreaseProposalRepository);
    const live = await repository.lockLiveOf(orderId);
    if (live === null) {
      throw new Error("aucun projet vivant à mettre en panne");
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      live.recordFailure("panne simulée", new Date(Date.now() + MINUTE_MS));
    }
    await repository.save(live);
  });
}

describe("Payé, puis appliqué (§2.6)", () => {
  it("le webhook réveille l'exécuteur : la révision écrite au total payé, la facture carte tient", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);

    await cardPaid(ctx, increase.providerRef);
    await deliver();

    expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "applied" });
    expect(await orderOf(order.id)).toMatchObject({
      totalCents: increase.targetCents,
      revision: 1,
      paymentStatus: "paid",
    });
    expect(await ctx.prisma.orderRevisionEntry.count({ where: { orderId: order.id } })).toBe(1);
    expect(await journalOf(order.id)).toEqual([
      "order.card_increase_proposed",
      "order.card_increase_paid",
      "order.card_increase_applied",
    ]);
    expect(await refundRequestsOf(order.id)).toEqual([]);
    await cardInvoiceHolds(order.id);
  });

  it("la hausse appliquée écrit « commande modifiée » : la différence réglée par carte", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);

    await cardPaid(ctx, increase.providerRef);
    await deliver();

    const mails = sentMails.filter((mail) => mail.template === "customer.order-revised");
    expect(mails).toHaveLength(1);
    const data = mails[0]?.data as B2bMails["customer.order-revised"];
    expect(data).toMatchObject({
      previousTotalCents: order.totalCents,
      totalCents: increase.targetCents,
      moneyNote: "card_charged",
    });
    const rendered = b2bMailTemplates({ supportEmail: "a@lfc.test", backOfficeUrl: "" })[
      "customer.order-revised"
    ](data);
    expect(rendered.text).toContain("a été réglée par carte");
    // Une commande personnelle est un achat de particulier : le TTC seul.
    expect(data.pretaxCents).not.toBeNull();
    expect(rendered.text).not.toMatch(/\bHT\b/u);
  });

  it("le webhook rejoué ne fait rien de plus", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);
    await cardPaid(ctx, increase.providerRef);
    await deliver();

    await cardPaid(ctx, increase.providerRef);
    await deliver();

    expect(await orderOf(order.id)).toMatchObject({
      revision: 1,
      totalCents: increase.targetCents,
    });
    expect(
      (await journalOf(order.id)).filter((type) => type === "order.card_increase_applied"),
    ).toHaveLength(1);
  });
});

describe("Payé, puis refusé et rendu (§2.6 étape 4, R8, R11, R13)", () => {
  it("journée arrêtée au fournil entre-temps : refusé, rendu en AJUSTEMENT, le client prévenu", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);
    await staff().post(`/admin/production/batch/${DAY}/close`).expect(201);
    await deliver();

    await cardPaid(ctx, increase.providerRef);
    await deliver();

    expect(await proposalOf(increase.proposalId)).toMatchObject({
      state: "refused",
      refusal: "plan_closed",
    });
    expect(await orderOf(order.id)).toMatchObject({ totalCents: order.totalCents, revision: 0 });
    expect(await refundRequestsOf(order.id)).toEqual([
      expect.objectContaining({
        form: "amount",
        nature: "adjustment",
        reason: "revision_refused",
        announcedCents: increase.complementCents,
      }),
    ]);
    const mail = await ctx.prisma.mailRequest.findUnique({
      where: { idempotencyKey: `card-increase-refused:${increase.proposalId}` },
      select: { template: true },
    });
    expect(mail?.template).toBe("customer.order-modification-failed");
  });
});

describe("Payé tard (§2.5)", () => {
  it("un complément payé après l'abandon est fermé, puis rendu après validation", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);
    await buyer().delete(`/orders/${order.id}/complement`).expect(204);

    await cardPaid(ctx, increase.providerRef);
    await deliver();

    expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "closed" });
    expect(await refundRequestsOf(order.id)).toEqual([
      expect.objectContaining({
        nature: "adjustment",
        reason: "late_payment",
        announcedCents: increase.complementCents,
      }),
    ]);
    expect(await orderOf(order.id)).toMatchObject({ totalCents: order.totalCents, revision: 0 });
  });
});

describe("Le délai et le balayage (§2.7)", () => {
  it("le délai passé : l'intention annulée, le projet abandonné (cause `expired`)", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);

    const early = await machine("/admin/orders/card-increases/expire");
    expect(early.body).toEqual({ abandoned: 0, settled: 0, retried: 0 });
    wall.offsetMs = 16 * MINUTE_MS;
    const swept = await machine("/admin/orders/card-increases/expire");

    expect(swept.body).toEqual({ abandoned: 1, settled: 0, retried: 0 });
    expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "abandoned" });
    expect(cards.provider.cancelled).toContain(increase.providerRef);
  });

  it("`already_paid` au délai : rattrapé par la vérification, puis appliqué", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);
    cards.provider.cancellation = { kind: "already_paid" };
    cards.provider.states.set(increase.providerRef, "succeeded");
    wall.offsetMs = 16 * MINUTE_MS;

    const swept = await machine("/admin/orders/card-increases/expire");
    await deliver();

    expect(swept.body).toEqual({ abandoned: 0, settled: 1, retried: 0 });
    expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "applied" });
    expect(await orderOf(order.id)).toMatchObject({ totalCents: increase.targetCents });
  });

  it("webhook perdu : le balayage demande au prestataire, et le projet s'applique", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);
    cards.provider.states.set(increase.providerRef, "succeeded");
    wall.offsetMs = 6 * MINUTE_MS;

    const swept = await machine("/admin/orders/card-increases/sweep");
    await deliver();

    expect(swept.body).toEqual({ applied: 0, checked: 1 });
    expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "applied" });
    expect(await orderOf(order.id)).toMatchObject({ revision: 1 });
  });

  it("sans jeton machine, les deux routes refusent", async () => {
    await ctx.http().post("/admin/orders/card-increases/sweep").expect(401);
    await ctx.http().post("/admin/orders/card-increases/expire").expect(401);
  });
});

/**
 * Un complément payé que l'exécuteur ne prend PAS encore : le mur recule de
 * dix minutes, et le bail refuse un projet dont l'essai n'est pas dû — le
 * projet reste `ready`, comme après un réveil perdu.
 */
async function paidButNotApplied(order: PaidOrder): Promise<Proposed> {
  const increase = await proposed(order);
  wall.offsetMs = -10 * MINUTE_MS;
  await cardPaid(ctx, increase.providerRef);
  await deliver();
  wall.offsetMs = 0;
  expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "ready" });
  return increase;
}

describe("En panne, puis Relancer (§2.6 étape 5)", () => {
  it("`stalled` : « Relancer » (b2b_orders:write) le rend à l'exécuteur, qui l'applique", async () => {
    const order = await paidOrder();
    const increase = await paidButNotApplied(order);
    await stall(order.id);
    expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "stalled", attempts: 5 });

    await staff().post(`/admin/orders/${order.id}/card-increase/relaunch`).expect(204);
    await deliver();

    expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "applied" });
    expect(await orderOf(order.id)).toMatchObject({
      revision: 1,
      totalCents: increase.targetCents,
    });
    expect(await journalOf(order.id)).toContain("order.card_increase_relaunched");
  });

  it("rien en panne : « Relancer » refuse, nommé (409)", async () => {
    const order = await paidOrder();
    await proposed(order);

    const refused = await staff()
      .post(`/admin/orders/${order.id}/card-increase/relaunch`)
      .expect(409);

    expect(refused.body).toMatchObject({ code: "orders.card_increase.nothing_to_relaunch" });
  });
});

describe("L'annulation de la commande avec un projet vivant (R9)", () => {
  const cancel = (orderId: string) =>
    staff()
      .post(`/admin/orders/${orderId}/cancel`)
      .send({ reason: "Le client a appelé : il ne vient plus" })
      .expect(204);

  it("`awaiting_payment` : abandonné, son intention annulée après validation", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);

    await cancel(order.id);
    await deliver();

    expect(await proposalOf(increase.proposalId)).toMatchObject({ state: "abandoned" });
    expect(cards.provider.cancelled).toContain(increase.providerRef);
    expect((await refundRequestsOf(order.id)).map((request) => request.reason)).toEqual([
      "cancellation",
    ]);
  });

  it.each(["ready", "stalled"] as const)(
    "`%s` : refusé sans remboursement propre ; l'annulation rend les deux paiements",
    async (state) => {
      const order = await paidOrder();
      const increase = await paidButNotApplied(order);
      if (state === "stalled") {
        await stall(order.id);
      }

      await cancel(order.id);
      await deliver();

      expect(await proposalOf(increase.proposalId)).toMatchObject({
        state: "refused",
        refusal: "order_cancelled",
      });
      const requests = await refundRequestsOf(order.id);
      expect(requests).toHaveLength(2);
      expect(requests.every((request) => request.nature === "return")).toBe(true);
      expect(requests.map((request) => request.reason)).toEqual(["cancellation", "cancellation"]);
      expect(await orderOf(order.id)).toMatchObject({ status: "cancelled", revision: 0 });
    },
  );
});

describe("La fiche staff voit le projet vivant (§2.8)", () => {
  const sheet = async (orderId: string): Promise<AdminOrderView> =>
    jsonBody<AdminOrderView>(await staff().get(`/admin/orders/${orderId}`).expect(200));

  it("en attente de paiement, puis en panne, puis `null` une fois appliqué", async () => {
    const order = await paidOrder();
    const increase = await proposed(order);
    const complementCents = increase.targetCents - order.totalCents;

    expect((await sheet(order.id)).cardIncrease).toEqual({
      complementCents,
      state: "awaiting_payment",
      expiresAt: expect.any(String) as string,
      refusal: null,
    });

    wall.offsetMs = -10 * MINUTE_MS;
    await cardPaid(ctx, increase.providerRef);
    await deliver();
    wall.offsetMs = 0;
    await stall(order.id);
    expect((await sheet(order.id)).cardIncrease).toMatchObject({ state: "stalled" });

    await staff().post(`/admin/orders/${order.id}/card-increase/relaunch`).expect(204);
    await deliver();

    expect((await sheet(order.id)).cardIncrease).toBeNull();
  });

  it("aucun projet : `null`", async () => {
    const order = await paidOrder();

    expect((await sheet(order.id)).cardIncrease).toBeNull();
  });
});
