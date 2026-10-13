import { CommandBus } from "@nestjs/cqrs";

import { IssueOrderRefundCommand } from "../src/b2b/orders/application/commands/issue-order-refund.command.js";
import { RecordOrderRefundCommand } from "../src/b2b/orders/application/commands/record-order-refund.command.js";
import type { PaymentRefundStatus } from "../src/b2b/payments/domain/payment-gateway.js";
import {
  PaymentRefunder,
  type IssuedRefund,
  type RefundIssuance,
  type RefundLookup,
  type RefundRequestParams,
} from "../src/b2b/payments/domain/payment-refunder.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { currentTransaction } from "../src/platform/database/transaction.store.js";
import { WallClock } from "../src/platform/time/wall-clock.js";
import { bootScene, context, seedOrder, type OrderSeed } from "./order-staff-cancel-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/**
 * **La scène du remboursement à l'annulation** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, lot C4) — celle de
 * l'annulation staff, plus deux doublures :
 *
 * - **Stripe** côté remboursement : un magasin de `re_…` par intention, avec la
 *   recherche par métadonnée, l'idempotence par clé, le « reste remboursable »
 *   — et des issues écrites d'avance. 🔴 Il REFUSE d'être appelé sous une
 *   transaction : un appel sous transaction est compté, et chaque suite le
 *   vérifie nul ;
 * - **l'horloge murale** : l'heure réelle plus un décalage qu'on avance, pour
 *   faire échoir un bail ou une échéance sans attendre.
 */

/** Une issue imposée au prochain appel ; sinon Stripe émet. */
export type ScriptedOutcome =
  | { readonly kind: "unavailable" }
  | { readonly kind: "declined"; readonly code: string }
  | { readonly kind: "nothing_left" }
  /** Émet, mais pour ce montant — un refus du carnet (`exceeds_charge`). */
  | { readonly kind: "issue_amount"; readonly amountCents: number };

interface FakeRefund extends IssuedRefund {
  readonly paymentIntentId: string;
  readonly requestId: string;
  readonly generation: number;
  readonly key: string;
}

const DEAD: ReadonlySet<PaymentRefundStatus> = new Set(["failed", "canceled"]);

export const stripe = {
  refunds: [] as FakeRefund[],
  charged: new Map<string, number>(),
  script: [] as ScriptedOutcome[],
  /** Le statut des `re_…` émis. */
  status: "pending" as PaymentRefundStatus,
  calls: [] as RefundRequestParams[],
  underTransaction: 0,
  /** Joué pendant l'appel, avant la réponse — une barrière. */
  during: null as (() => Promise<void>) | null,
  /** Joué une fois le `re_…` créé, avant la réponse — le webhook qui double l'exécuteur. */
  afterIssue: null as ((refund: IssuedRefund) => Promise<void>) | null,
};

function findOurs(params: RefundRequestParams): FakeRefund | undefined {
  return stripe.refunds.find(
    (refund) =>
      refund.paymentIntentId === params.paymentIntentId &&
      refund.requestId === params.requestId &&
      refund.generation === params.generation &&
      !DEAD.has(refund.status),
  );
}

function remainderOf(paymentIntentId: string): number {
  const charged = stripe.charged.get(paymentIntentId) ?? 0;
  const taken = stripe.refunds
    .filter((refund) => refund.paymentIntentId === paymentIntentId && !DEAD.has(refund.status))
    .reduce((sum, refund) => sum + refund.amountCents, 0);
  return charged - taken;
}

function issue(params: RefundRequestParams, amountCents: number): RefundIssuance {
  const known = stripe.refunds.find((refund) => refund.key === params.key);
  if (known !== undefined) {
    return { kind: "issued", refund: known };
  }
  const refund: FakeRefund = {
    refundId: `re_e2e_${String(stripe.refunds.length + 1)}`,
    amountCents,
    currency: "eur",
    status: stripe.status,
    createdAt: new Date(),
    paymentIntentId: params.paymentIntentId,
    requestId: params.requestId,
    generation: params.generation,
    key: params.key,
  };
  stripe.refunds.push(refund);
  return { kind: "issued", refund };
}

class FakeStripeRefunder extends PaymentRefunder {
  async refundRemainder(params: RefundRequestParams): Promise<RefundIssuance> {
    if (currentTransaction() !== undefined) {
      stripe.underTransaction += 1;
    }
    stripe.calls.push(params);
    const during = stripe.during;
    stripe.during = null;
    await during?.();
    const found = findOurs(params);
    if (found !== undefined) {
      return { kind: "issued", refund: found };
    }
    const scripted = stripe.script.shift();
    if (scripted === undefined) {
      const remainder = remainderOf(params.paymentIntentId);
      return remainder <= 0 ? { kind: "nothing_left" } : this.issued(params, remainder);
    }
    switch (scripted.kind) {
      case "unavailable":
        return { kind: "unavailable", reason: "ECONNRESET" };
      case "declined":
        return { kind: "declined", code: scripted.code };
      case "nothing_left":
        return { kind: "nothing_left" };
      case "issue_amount":
        return this.issued(params, scripted.amountCents);
    }
  }

  private async issued(params: RefundRequestParams, amountCents: number): Promise<RefundIssuance> {
    const issuance = issue(params, amountCents);
    const after = stripe.afterIssue;
    stripe.afterIssue = null;
    if (after !== null && issuance.kind === "issued") {
      await after(issuance.refund);
    }
    return issuance;
  }

  findRefund(params: RefundRequestParams): Promise<RefundLookup> {
    const found = findOurs(params);
    return Promise.resolve(
      found === undefined ? { kind: "none" } : { kind: "found", refund: found },
    );
  }
}

/** L'heure du mur, réelle, plus un décalage qu'on avance. */
export class OffsetWallClock extends WallClock {
  offsetMs = 0;

  elapsedNow(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

export const wall = new OffsetWallClock();

export function bootRefundScene() {
  return bootScene([
    { token: PaymentRefunder, value: new FakeStripeRefunder() },
    { token: WallClock, value: wall },
  ]);
}

export function resetStripe(): void {
  stripe.refunds.splice(0);
  stripe.charged.clear();
  stripe.script.splice(0);
  stripe.status = "pending";
  stripe.calls.splice(0);
  stripe.underTransaction = 0;
  stripe.during = null;
  stripe.afterIssue = null;
  wall.offsetMs = 0;
}

/** Une commande payée par carte, que « Stripe » sait remboursable de son total. */
export async function seedPaidOrder(seed: OrderSeed = {}) {
  const order = await seedOrder({ payment: PaymentStatus.paid, ...seed });
  if (order.intent !== null) {
    stripe.charged.set(order.intent, seed.totalCents ?? 1_055);
  }
  return order;
}

/** Un webhook de remboursement, par la vraie commande, comme le contrôleur. */
export function webhook(
  paymentIntentId: string,
  refund: Pick<IssuedRefund, "refundId" | "amountCents" | "createdAt">,
  status: PaymentRefundStatus,
): Promise<void> {
  return context()
    .app.get(CommandBus)
    .execute(
      new RecordOrderRefundCommand(paymentIntentId, {
        stripeRefundId: refund.refundId,
        amountCents: refund.amountCents,
        currency: "eur",
        status,
        refundedAt: refund.createdAt,
      }),
    );
}

/** L'exécuteur, tout de suite — comme le ferait le rappel d'après validation. */
export function issueNow(orderId: string): Promise<void> {
  return context().app.get(CommandBus).execute(new IssueOrderRefundCommand(orderId));
}

export const refundRequestOf = (orderId: string) =>
  context().prisma.orderRefundRequest.findUnique({ where: { orderId } });

export const ledgerOf = (orderId: string) =>
  context().prisma.orderRefund.findMany({
    where: { orderId },
    orderBy: { recordedAt: "asc" },
    select: { stripeRefundId: true, amountCents: true, status: true },
  });

export const attention = () =>
  context().prisma.staffNotification.findMany({
    where: { kind: "order.refund_attention" },
    select: { subject: true, body: true },
  });

export const sweepRefunds = () =>
  context()
    .http()
    .post("/admin/orders/refunds/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN);

/** Fait échoir toute échéance : le mur avance d'un jour. */
export function advanceWallPastRetries(): void {
  wall.offsetMs += 24 * 60 * 60 * 1000;
}
