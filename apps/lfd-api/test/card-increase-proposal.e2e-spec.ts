/**
 * **Le projet de hausse par carte, sur le vrai Postgres** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7).
 *
 * Ce que seule la base prouve : le `DELETE` refusé, l'index unique partiel
 * (un seul projet vivant par commande), le CHECK du complément, l'écriture
 * conditionnée du dépôt. Puis le webhook d'un complément, par la vraie
 * commande de `card-payment` : le projet passe `ready`, la commande ne bouge
 * pas ; sans projet, l'encaissement est refusé bruyamment. Et `claim` rend
 * le montant du PREMIER paiement, plus le total.
 *
 * Seule frontière doublée : le prestataire de carte. Les instants des projets
 * ne sont comparés qu'entre eux, jamais à l'horloge.
 */
import { CardPayments } from "../src/card-payment/channels/requests/index.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { OrderSubjectSettlement } from "../src/b2b/orders/application/services/order-subject-settlement.js";
import { CardIncreaseProposal } from "../src/b2b/orders/revision/domain/entities/card-increase-proposal.js";
import { ComplementWithoutProposalError } from "../src/b2b/orders/revision/domain/errors/card-increase-proposal-errors.js";
import { CardIncreaseProposalRepository } from "../src/b2b/orders/revision/domain/ports/card-increase-proposal.repository.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { cardPaid, cardProvidersDouble } from "./card-payments.js";
import { bootstrapE2e, type E2eContext } from "./e2e-harness.js";
import { createUser } from "./factories.js";
import { payByCard, pickupSite, placeOrder } from "./order-factory.js";

const BUYER = "auth0|hausse";
const COMPLEMENT_CENTS = 1_200;
const cards = cardProvidersDouble("pi_hausse");

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({ overrides: [{ token: CardProviders, value: cards }] });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

interface PaidOrder {
  readonly id: string;
  readonly totalCents: number;
  readonly firstRef: string;
}

/** Une commande personnelle payée par carte, par le vrai chemin. */
async function paidOrder(): Promise<PaidOrder> {
  const buyer = await createUser(ctx.prisma, { auth0Sub: BUYER, firstName: "Léa" });
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.id,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
  });
  await payByCard(ctx, order);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true, paymentStatus: true, placedByUserId: true },
  });
  expect(row.paymentStatus).toBe(PaymentStatus.paid);
  if (order.paymentIntentId === null) {
    throw new Error("la commande de la scène doit être payée par carte");
  }
  return { id: order.id, totalCents: row.totalCents, firstRef: order.paymentIntentId };
}

/** Un complément préparé hors transaction, rattaché DANS celle qui naît le projet. */
async function proposeIncrease(
  order: PaidOrder,
): Promise<{ readonly proposalId: string; readonly providerRef: string }> {
  const payments = ctx.app.get(CardPayments);
  const { prepared } = await payments.prepare("order", COMPLEMENT_CENTS, "personal");
  sequence += 1;
  const proposalId = `prop_e2e_${String(sequence)}`;
  await ctx.app.get(UnitOfWork).run(async () => {
    const attached = await payments.attach({ type: "order", id: order.id }, prepared, "complement");
    await ctx.app.get(CardIncreaseProposalRepository).save(
      CardIncreaseProposal.propose({
        id: proposalId,
        orderId: order.id,
        baseRevision: 0,
        content: { lines: [] },
        rules: { rulesOf: "customer" },
        totalBeforeCents: order.totalCents,
        targetTotalCents: order.totalCents + COMPLEMENT_CENTS,
        author: { kind: "customer", userId: "usr_e2e" },
        paymentId: attached.paymentId,
        now: new Date(0),
        cutoff: null,
      }),
    );
  });
  return { proposalId, providerRef: prepared.providerRef };
}

async function stateOf(proposalId: string): Promise<string> {
  const row = await ctx.prisma.orderRevisionProposal.findUniqueOrThrow({
    where: { id: proposalId },
    select: { state: true },
  });
  return row.state;
}

describe("order_revision_proposal — les gardes de la base", () => {
  it("refuse le DELETE d'un projet", async () => {
    const order = await paidOrder();
    const { proposalId } = await proposeIncrease(order);

    await expect(
      ctx.prisma
        .$executeRaw`DELETE FROM "public"."order_revision_proposal" WHERE "id" = ${proposalId}`,
    ).rejects.toThrow(/ne s'efface pas/);
  });

  it("refuse un second projet vivant sur la même commande (R5)", async () => {
    const order = await paidOrder();
    await proposeIncrease(order);

    await expect(proposeIncrease(order)).rejects.toThrow();
    expect(await ctx.prisma.orderRevisionProposal.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("refuse un complément nul", async () => {
    const order = await paidOrder();
    const { proposalId } = await proposeIncrease(order);

    await expect(
      ctx.prisma
        .$executeRaw`UPDATE "public"."order_revision_proposal" SET "complement_cents" = 0 WHERE "id" = ${proposalId}`,
    ).rejects.toThrow(/order_revision_proposal_complement_check/);
  });

  it("une transition conditionnée sur un état périmé n'écrit rien", async () => {
    const order = await paidOrder();
    const { proposalId } = await proposeIncrease(order);
    const repo = ctx.app.get(CardIncreaseProposalRepository);
    const payment = await ctx.prisma.orderRevisionProposal.findUniqueOrThrow({
      where: { id: proposalId },
      select: { paymentId: true },
    });

    const written = await ctx.app.get(UnitOfWork).run(async () => {
      const first = await repo.lockByPayment(payment.paymentId);
      const stale = CardIncreaseProposal.rehydrate({
        ...(first ?? fail()).toPersistence(),
        state: "ready",
      });
      stale.apply(new Date(0));
      return repo.save(stale);
    });

    expect(written).toBe(false);
    expect(await stateOf(proposalId)).toBe("awaiting_payment");
  });
});

describe("Le webhook d'un complément (plan S2, §2.5)", () => {
  it("le projet passe `ready` ; la commande garde son total et son premier paiement", async () => {
    const order = await paidOrder();
    const { proposalId, providerRef } = await proposeIncrease(order);

    await cardPaid(ctx, providerRef);

    expect(await stateOf(proposalId)).toBe("ready");
    const row = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { totalCents: true, paymentStatus: true, stripePaymentIntentId: true },
    });
    expect(row).toEqual({
      totalCents: order.totalCents,
      paymentStatus: PaymentStatus.paid,
      stripePaymentIntentId: order.firstRef,
    });
  });

  /** Régression (vitruve v3) : sans projet, l'argent du complément partait en silence. */
  it("🔴 un complément sans projet est refusé bruyamment, et reste à encaisser", async () => {
    const order = await paidOrder();
    const payments = ctx.app.get(CardPayments);
    const { prepared } = await payments.prepare("order", COMPLEMENT_CENTS, "personal");
    const attached = await ctx.app
      .get(UnitOfWork)
      .run(() => payments.attach({ type: "order", id: order.id }, prepared, "complement"));

    await expect(cardPaid(ctx, prepared.providerRef)).rejects.toBeInstanceOf(
      ComplementWithoutProposalError,
    );
    const line = await ctx.prisma.cardPayment.findUniqueOrThrow({
      where: { id: attached.paymentId },
      select: { state: true },
    });
    expect(line.state).toBe("pending");
  });
});

describe("claim — le montant du premier paiement (plan S2, §2.5)", () => {
  /** Régression (vitruve v3) : `claim` rendait le total, faux après une hausse appliquée. */
  it("retranche les compléments des hausses appliquées", async () => {
    const order = await paidOrder();
    const { proposalId, providerRef } = await proposeIncrease(order);
    await cardPaid(ctx, providerRef);
    // L'exécuteur arrive au lot S2.c : le projet passe `applied` par
    // l'agrégat, et la commande prend en SQL le total qu'il écrira.
    const repo = ctx.app.get(CardIncreaseProposalRepository);
    const { paymentId } = await ctx.prisma.orderRevisionProposal.findUniqueOrThrow({
      where: { id: proposalId },
      select: { paymentId: true },
    });
    await ctx.app.get(UnitOfWork).run(async () => {
      const ready = (await repo.lockByPayment(paymentId)) ?? fail();
      ready.apply(new Date(0));
      await repo.save(ready);
    });
    expect(await stateOf(proposalId)).toBe("applied");
    await ctx.prisma.order.update({
      where: { id: order.id },
      data: { totalCents: order.totalCents + COMPLEMENT_CENTS },
    });

    const claim = await ctx.app.get(OrderSubjectSettlement).claim("lfc-stripe", order.firstRef);

    expect(claim?.amountCents).toBe(order.totalCents);
  });
});

function fail(): never {
  throw new Error("projet introuvable");
}
