import type { CardComplementPaymentView, OrderRevisionQuoteView } from "@lfd/contracts";
import type request from "supertest";

import { CardSettlementReader } from "../src/card-payment/channels/requests/index.js";
import type { RefundIssuance } from "../src/card-payment/domain/ports/card-provider-types.js";
import { CardProviders } from "../src/card-payment/domain/ports/card-providers.js";
import { MAILER } from "../src/mail/templates/mailer.tokens.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
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

/**
 * **La scène de la baisse carte** (plan
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12) —
 * partagée par les deux suites de la baisse. Seules frontières doublées : la
 * signature des jetons (le jeton EST le `sub`), le prestataire de carte
 * (`E2eCardProvider`) et l'envoi des e-mails (relevé, jamais parti).
 */

export const DAY = serviceDay(7);
export const BUYER = "auth0|baisse-carte";
export const cards = cardProvidersDouble("pi_baisse");

/** Le mur, décalé à la main : un réveil d'exécuteur « dans le passé » laisse un projet `ready`. */
class OffsetWallClock extends WallClock {
  offsetMs = 0;

  elapsedNow(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}
export const wall = new OffsetWallClock();
const MINUTE_MS = 60_000;

/** Les e-mails partis, relevés pour « commande modifiée ». */
export const sentMails: { readonly template: string; readonly data: unknown }[] = [];

const recordingMailer = {
  enabled: true,
  send: (args: { readonly template: string; readonly data: unknown }) => {
    sentMails.push(args);
    return Promise.resolve({ providerId: null });
  },
};

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

let current: E2eContext | null = null;

export function scene(): E2eContext {
  if (current === null) {
    throw new Error("la scène de la baisse n'est pas démarrée (bootCardRefundScene)");
  }
  return current;
}

export async function bootCardRefundScene(): Promise<E2eContext> {
  current = await bootstrapE2e({
    overrides: [
      { token: CardProviders, value: cards },
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: MAILER, value: recordingMailer },
      { token: WallClock, value: wall },
    ],
  });
  return current;
}

export async function resetCardRefundScene(): Promise<void> {
  await scene().reset();
  sentMails.splice(0);
  wall.offsetMs = 0;
  cards.provider.refundIssuances.splice(0);
  cards.provider.refundCalls.splice(0);
  cards.provider.states.clear();
  cards.provider.cancellation = { kind: "cancelled" };
}

export const buyer = () => scene().asSub(BUYER);
export const staff = () => scene().asSub(E2E_STAFF_SUB);

export interface PaidOrder {
  readonly id: string;
  readonly pickupId: string;
  readonly totalCents: number;
  readonly providerRef: string;
}

/** La commande voulue : un retrait au point de la commande, `DAY`, `quantity` croissants. */
export function content(pickupId: string, quantity: number, note = ""): Record<string, unknown> {
  return {
    requestedDeliveryDate: DAY,
    fulfillmentMethod: "pickup",
    pickupAddressId: pickupId,
    requestedWindow: { start: "07:00", end: "08:00" },
    note,
    lines: [{ sku: "VIE-001-1", quantity }],
  };
}

/** Une commande personnelle de `quantity` croissants, payée par carte, par le vrai chemin. */
export async function paidOrder(quantity = 6, voucherId?: string): Promise<PaidOrder> {
  const ctx = scene();
  const known = await ctx.prisma.user.findFirst({
    where: { auth0Sub: BUYER },
    select: { id: true },
  });
  const userId =
    known?.id ?? (await createUser(ctx.prisma, { auth0Sub: BUYER, firstName: "Léa" })).id;
  const pickupId = await pickupSite(ctx.prisma);
  const order = await placeOrder(ctx, {
    buyerUserId: userId,
    forDay: DAY,
    fulfillment: { method: "pickup", pickupSiteId: pickupId },
    lines: [{ sku: "VIE-001-1", quantity }],
    ...(voucherId === undefined ? {} : { voucherId }),
  });
  await payByCard(ctx, order);
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: { totalCents: true, paymentStatus: true },
  });
  expect(row.paymentStatus).toBe("paid");
  return {
    id: order.id,
    pickupId,
    totalCents: row.totalCents,
    providerRef: order.paymentIntentId ?? "",
  };
}

/** Le devis, par la route de l'auteur. */
export async function quoteOf(
  order: PaidOrder,
  quantity: number,
  by: "customer" | "staff" = "customer",
  note = "",
): Promise<OrderRevisionQuoteView> {
  const path = `${by === "staff" ? "/admin" : ""}/orders/${order.id}/revisions/quote`;
  const client = by === "staff" ? staff() : buyer();
  return jsonBody<OrderRevisionQuoteView>(
    await client
      .post(path)
      .send(content(order.pickupId, quantity, note))
      .expect(200),
  );
}

/** La modification au total du devis, par la route de l'auteur, au statut attendu. */
export async function revise(
  status: number,
  order: PaidOrder,
  quantity: number,
  by: "customer" | "staff" = "customer",
  note = "",
): Promise<request.Response> {
  const seen = await quoteOf(order, quantity, by, note);
  const path = `${by === "staff" ? "/admin" : ""}/orders/${order.id}/revisions`;
  const client = by === "staff" ? staff() : buyer();
  return client
    .post(path)
    .send({
      expectedRevision: seen.revision,
      expectedTotalCents: seen.totalCents,
      ...content(order.pickupId, quantity, note),
    })
    .expect(status);
}

/** Un remboursement que le prestataire doublé émettra, réussi. */
export function willRefund(
  amountCents: number,
  status: "succeeded" | "failed" = "succeeded",
): void {
  const issuance: RefundIssuance = {
    kind: "issued",
    refund: {
      refundId: `re_baisse_${String(cards.provider.refundCalls.length + cards.provider.refundIssuances.length + 1)}`,
      amountCents,
      currency: "eur",
      status,
      createdAt: new Date(),
    },
  };
  cards.provider.refundIssuances.push(issuance);
}

/** La boîte d'envoi livrée, puis les tâches de fond attendues — deux fois : un abonné en publie. */
export async function deliver(): Promise<void> {
  const ctx = scene();
  for (let round = 0; round < 2; round += 1) {
    await ctx.app.get(OutboxRelay).sweep();
    await ctx.drain();
  }
}

export async function orderOf(orderId: string) {
  return scene().prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { totalCents: true, revision: true, status: true, paymentStatus: true },
  });
}

export async function refundRequestsOf(orderId: string) {
  return scene().prisma.cardRefundRequest.findMany({
    where: { payment: { subjectId: orderId } },
    orderBy: { requestedAt: "asc" },
    select: {
      form: true,
      nature: true,
      reason: true,
      announcedCents: true,
      paymentId: true,
      state: true,
      requestedBy: true,
    },
  });
}

/** Les paiements de la commande, du plus ancien au plus récent. */
export async function paymentsOf(orderId: string) {
  return scene().prisma.cardPayment.findMany({
    where: { subjectType: "order", subjectId: orderId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, amountCents: true },
  });
}

/** La position carte : encaissé, rendu en ajustement, en retour. */
export async function positionOf(orderId: string) {
  const [position] = await scene()
    .app.get(CardSettlementReader)
    .positionOf([{ type: "order", id: orderId }]);
  return position;
}

/** La facture carte tient : encaissé − remboursé en ajustement = total de la commande. */
export async function cardInvoiceHolds(orderId: string): Promise<void> {
  const position = await positionOf(orderId);
  const order = await orderOf(orderId);
  expect((position?.chargedCents ?? 0) - (position?.refundedByNature.adjustment ?? 0)).toBe(
    order.totalCents,
  );
}

/** Une hausse payée et appliquée, par la route du client puis le webhook. */
export async function appliedIncrease(order: PaidOrder, quantity: number): Promise<number> {
  const seen = await quoteOf(order, quantity);
  const answer = jsonBody<CardComplementPaymentView>(
    await buyer()
      .post(`/orders/${order.id}/revisions/card-increase`)
      .send({
        expectedRevision: seen.revision,
        expectedTotalCents: seen.totalCents,
        ...content(order.pickupId, quantity),
      })
      .expect(200),
  );
  await cardPaid(scene(), cards.provider.issued.at(-1) ?? "");
  await deliver();
  expect(answer.complementCents).toBe(seen.totalCents - order.totalCents);
  return seen.totalCents;
}

/**
 * Une hausse demandée puis payée, mais pas appliquée : le webhook arrive sous
 * un mur reculé, le bail de l'exécuteur n'est pas échu, et le projet reste
 * `ready` — comme après un réveil perdu (la figure de
 * `card-increase-apply.e2e-spec.ts`).
 */
export async function paidButNotApplied(order: PaidOrder, quantity: number): Promise<void> {
  const seen = await quoteOf(order, quantity);
  await buyer()
    .post(`/orders/${order.id}/revisions/card-increase`)
    .send({
      expectedRevision: seen.revision,
      expectedTotalCents: seen.totalCents,
      ...content(order.pickupId, quantity),
    })
    .expect(200);
  expect(await proposalStateOf(order.id)).toBe("awaiting_payment");
  wall.offsetMs = -10 * MINUTE_MS;
  await cardPaid(scene(), cards.provider.issued.at(-1) ?? "");
  await deliver();
  wall.offsetMs = 0;
  expect(await proposalStateOf(order.id)).toBe("ready");
}

export async function proposalStateOf(orderId: string): Promise<string | undefined> {
  const row = await scene().prisma.orderRevisionProposal.findFirst({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    select: { state: true },
  });
  return row?.state;
}
