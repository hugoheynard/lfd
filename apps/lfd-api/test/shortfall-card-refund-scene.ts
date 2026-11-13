/**
 * **La scène du reste d'une carte remboursé au solde** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 9) — une
 * commande par carte encaissée, tirée au colisage avec un manque, décidée,
 * remise ; le prestataire doublé côté remboursement (une issue écrite d'avance
 * par appel, ou il émet ce qu'on lui demande, `pending`) ; le transport des
 * e-mails doublé, qui garde ce qu'il envoie. Partagée par les deux suites
 * `shortfall-card-refund-*.e2e-spec.ts`.
 */
import type { MailReceipt, SendMailArgs } from "@lfd/mailer";

import type {
  CardRefundStatus,
  IssuedRefund,
  RefundIssuance,
  RefundLookup,
  RefundLookupParams,
  RefundParams,
} from "../src/card-payment/domain/ports/card-provider-types.js";
import type { B2bMails } from "../src/mail/templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../src/mail/templates/mailer.tokens.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { OutboxRelay } from "../src/platform/outbox/outbox-relay.js";
import { e2eCardProviders, recordCardEvent, settleCardPayments } from "./card-payments.js";
import type { E2eRefundBehaviour } from "./card-payments.js";
import type { E2eContext } from "./e2e-harness.js";
import { addBillingAddress, attachTo, createCompany, createUser } from "./factories.js";
import { handOver, pickupSite, placeOrder } from "./order-factory.js";
import {
  bootstrapProductionDay,
  closeOrder,
  CROISSANT,
  MEMBER,
  SERVICE_DAY,
} from "./production-day-fixture.js";
import { decide, drawn, report, type Drawn } from "./shortfall-decision-scene.js";

/** Un e-mail tel que le transport doublé l'a reçu. */
export interface SentMail {
  readonly template: string;
  readonly key: string;
  readonly data: unknown;
}

/** Le transport des e-mails : il accepte tout, et garde ce qu'il a accepté. */
export class CapturingMailer implements B2bMailer {
  readonly enabled = true;
  readonly sent: SentMail[] = [];

  send<K extends keyof B2bMails>(args: SendMailArgs<B2bMails, K>): Promise<MailReceipt> {
    this.sent.push({ template: args.template, key: args.idempotencyKey ?? "", data: args.data });
    return Promise.resolve({ providerId: `re_mail_${String(this.sent.length)}` });
  }

  of(template: string): readonly SentMail[] {
    return this.sent.filter((mail) => mail.template === template);
  }
}

/** L'issue imposée au prochain appel ; sinon le prestataire émet le montant demandé. */
export type RefundScript =
  { readonly kind: "declined" } | { readonly kind: "issue_amount"; readonly amountCents: number };

/** Un `re_…` émis par le prestataire doublé. */
export interface ScriptedRefund {
  readonly refundId: string;
  readonly providerRef: string;
  readonly requestId: string;
  readonly generation: number;
  readonly key: string;
  readonly amountCents: number;
  readonly createdAt: Date;
}

/** Le prestataire, côté remboursement : idempotent par clé, retrouvable par demande. */
export class ScriptedRefunds implements E2eRefundBehaviour {
  readonly issued: ScriptedRefund[] = [];
  readonly script: RefundScript[] = [];

  refund(providerRef: string, params: RefundParams): Promise<RefundIssuance> {
    const known = this.issued.find((refund) => refund.key === params.key);
    if (known !== undefined) {
      return Promise.resolve(issuedOf(known));
    }
    const next = this.script.shift();
    if (next?.kind === "declined") {
      return Promise.resolve({ kind: "declined", code: "card_declined" });
    }
    const refund: ScriptedRefund = {
      refundId: `re_e9_${String(this.issued.length + 1)}`,
      providerRef,
      requestId: params.requestId,
      generation: params.generation,
      key: params.key,
      amountCents: next?.kind === "issue_amount" ? next.amountCents : (params.amountCents ?? 0),
      createdAt: new Date(),
    };
    this.issued.push(refund);
    return Promise.resolve(issuedOf(refund));
  }

  findRefund(providerRef: string, params: RefundLookupParams): Promise<RefundLookup> {
    const found = this.issued.find(
      (refund) =>
        refund.providerRef === providerRef &&
        refund.requestId === params.requestId &&
        refund.generation === params.generation,
    );
    return Promise.resolve(
      found === undefined ? { kind: "none" } : { kind: "found", refund: issuedRefundOf(found) },
    );
  }

  /** Le dernier `re_…` émis pour cette demande. */
  forRequest(requestId: string): ScriptedRefund {
    const found = this.issued.filter((refund) => refund.requestId === requestId).at(-1);
    if (found === undefined) {
      throw new TypeError(`Aucun remboursement émis pour la demande ${requestId}.`);
    }
    return found;
  }
}

/** Le `re_…` tel que le prestataire le rend, en attente de la banque. */
function issuedRefundOf(refund: ScriptedRefund): IssuedRefund {
  return {
    refundId: refund.refundId,
    amountCents: refund.amountCents,
    currency: "eur",
    status: "pending",
    createdAt: refund.createdAt,
  };
}

function issuedOf(refund: ScriptedRefund): RefundIssuance {
  return { kind: "issued", refund: issuedRefundOf(refund) };
}

/** La scène montée : l'application, la file des intentions, le transport, le prestataire. */
export async function bootShortfallCardScene() {
  const mailer = new CapturingMailer();
  const { ctx, issued } = await bootstrapProductionDay([{ token: MAILER, value: mailer }]);
  const refunds = new ScriptedRefunds();
  e2eCardProviders(ctx).provider.refundBehaviour = refunds;
  return { ctx, issued, mailer, refunds };
}

/** Remet la scène à zéro entre deux tests, base comprise. */
export async function resetScene(
  ctx: E2eContext,
  mailer: CapturingMailer,
  refunds: ScriptedRefunds,
): Promise<void> {
  await ctx.reset();
  mailer.sent.splice(0);
  refunds.issued.splice(0);
  refunds.script.splice(0);
}

/** La boîte d'envoi, relayée jusqu'au calme. */
export async function relayAll(ctx: E2eContext): Promise<void> {
  const relay = ctx.app.get(OutboxRelay);
  for (let round = 0; round < 4; round += 1) {
    await relay.sweep();
    await ctx.drain();
  }
}

/** Qui paie : un pro (sa société, facturée) ou un particulier (pas de facture). */
export type Buyer = "pro" | "individual";

/** La société facturée d'un pro : adresse de facturation et TVA intracommunautaire. */
async function proCompany(ctx: E2eContext, userId: string): Promise<string> {
  const company = await createCompany(ctx.prisma, { raisonSociale: "Boulangerie E9" });
  await addBillingAddress(ctx.prisma, company.id);
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { vatNumber: "FR40303265045" },
  });
  await attachTo(ctx.prisma, userId, company.id, CustomerRole.owner);
  return company.id;
}

/** Une commande par carte de `quantity` croissants, encaissée, tirée, un seul au sac, le manque signalé. */
export async function paidCardShortfall(
  ctx: E2eContext,
  issued: string[],
  buyer: Buyer,
  quantity = 3,
): Promise<Drawn> {
  const user = await createUser(ctx.prisma, { auth0Sub: MEMBER });
  const companyId = buyer === "pro" ? await proCompany(ctx, user.id) : null;
  const placed = await placeOrder(ctx, {
    buyerUserId: user.id,
    companyId,
    ...(buyer === "pro" ? { settlement: "card" as const } : {}),
    forDay: SERVICE_DAY,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: CROISSANT, quantity }],
  });
  await settleCardPayments(ctx, issued);
  const order = await drawn(ctx, placed, 1);
  expect(await report(ctx, order.id)).toBe(204);
  return order;
}

/** La décision, la fermeture du sac, la remise, puis la boîte d'envoi relayée. */
export async function departIncomplete(ctx: E2eContext, order: Drawn): Promise<void> {
  expect((await decide(ctx, order.id)).status).toBe(204);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  await handOver(ctx, order);
  await relayAll(ctx);
}

/** Les paiements par carte de la commande et ses demandes de raison `shortfall`. */
export async function shortfallRequests(ctx: E2eContext, orderId: string) {
  const payments = await ctx.prisma.cardPayment.findMany({
    where: { subjectType: "order", subjectId: orderId },
    select: { id: true, amountCents: true, providerRef: true },
  });
  const requests = await ctx.prisma.cardRefundRequest.findMany({
    where: { paymentId: { in: payments.map((payment) => payment.id) }, reason: "shortfall" },
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
  });
  const chargedCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  return { payments, requests, chargedCents };
}

/** Le facturable posé au solde. */
export async function billableOf(ctx: E2eContext, orderId: string): Promise<number> {
  const row = await ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { billableTotalCents: true },
  });
  if (row.billableTotalCents === null) {
    throw new TypeError("La commande remise devait être soldée.");
  }
  return row.billableTotalCents;
}

/**
 * **Le webhook d'un remboursement émis**, par la vraie commande de
 * `card-payment` : sa métadonnée le rattache à sa demande. La boîte
 * d'envoi est ensuite relayée — l'avoir, la facture, le courriel.
 */
export async function refundSettles(
  ctx: E2eContext,
  refund: ScriptedRefund,
  status: CardRefundStatus = "succeeded",
): Promise<void> {
  await recordCardEvent(ctx, (eventId) => ({
    kind: "refund",
    eventId,
    eventType: "refund.updated",
    providerRef: refund.providerRef,
    refundId: refund.refundId,
    amountCents: refund.amountCents,
    currency: "eur",
    status,
    createdAt: refund.createdAt,
    ours: { requestId: refund.requestId, generation: refund.generation },
  }));
  await relayAll(ctx);
}
