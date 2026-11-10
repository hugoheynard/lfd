import { CommandBus } from "@nestjs/cqrs";

import { IssueCardRefundCommand } from "../src/card-payment/application/commands/issue-card-refund.command.js";
import type {
  CardRefundStatus,
  IssuedRefund,
  RefundIssuance,
  RefundLookup,
  RefundLookupParams,
  RefundParams,
} from "../src/card-payment/domain/ports/card-provider-types.js";
import { PaymentStatus } from "../src/platform/database/client/client.js";
import { currentTransaction } from "../src/platform/database/transaction.store.js";
import { WallClock } from "../src/platform/time/wall-clock.js";
import { RecordProviderEventCommand } from "../src/card-payment/application/commands/record-provider-event.command.js";
import { E2E_CARD_ACCOUNT, type E2eRefundBehaviour } from "./card-payments.js";
import { bootScene, context, sceneCardProvider } from "./order-staff-cancel-scene.js";
import { seedOrder, type OrderSeed } from "./order-staff-cancel-orders.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/**
 * **La scène du remboursement à l'annulation** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, lot C4 ; rebâtie
 * au lot P1.c du plan M2 : l'annulation demande au bloc `card-payment`, dont
 * l'exécuteur, le balayage, « Relancer » et le constat sont les seuls) — celle
 * de l'annulation staff, plus deux doublures :
 *
 * - **Stripe** côté remboursement, branché sur le prestataire doublé de la
 *   scène (`refundBehaviour`, jeton `CardProviders`) : un magasin de `re_…`
 *   par intention, avec la recherche par métadonnée (demande + génération),
 *   l'idempotence par clé, le « reste remboursable » — et des issues écrites
 *   d'avance. 🔴 Il REFUSE d'être appelé sous une transaction : un appel sous
 *   transaction est compté, et chaque suite le vérifie nul ;
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

/** Un appel reçu : l'intention visée et les paramètres de la demande. */
interface RefundCall extends RefundParams {
  readonly paymentIntentId: string;
}

export interface FakeRefund extends IssuedRefund {
  readonly paymentIntentId: string;
  /** La demande de `card-payment` qui l'a émis ; vide pour un `re_…` du tableau de bord. */
  readonly requestId: string;
  readonly generation: number;
  readonly key: string;
}

const DEAD: ReadonlySet<CardRefundStatus> = new Set(["failed", "canceled"]);

export const stripe = {
  refunds: [] as FakeRefund[],
  charged: new Map<string, number>(),
  script: [] as ScriptedOutcome[],
  /** Le statut des `re_…` émis. */
  status: "pending" as CardRefundStatus,
  calls: [] as RefundCall[],
  underTransaction: 0,
  /** Joué pendant l'appel, avant la réponse — une barrière. */
  during: null as (() => Promise<void>) | null,
  /** Joué une fois le `re_…` créé, avant la réponse — le webhook qui double l'exécuteur. */
  afterIssue: null as ((refund: FakeRefund) => Promise<void>) | null,
};

function findOurs(paymentIntentId: string, params: RefundLookupParams): FakeRefund | undefined {
  return stripe.refunds.find(
    (refund) =>
      refund.paymentIntentId === paymentIntentId &&
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

function issue(call: RefundCall, amountCents: number): FakeRefund {
  const known = stripe.refunds.find((refund) => refund.key === call.key);
  if (known !== undefined) {
    return known;
  }
  const refund: FakeRefund = {
    refundId: `re_e2e_${String(stripe.refunds.length + 1)}`,
    amountCents,
    currency: "eur",
    status: stripe.status,
    createdAt: new Date(),
    paymentIntentId: call.paymentIntentId,
    requestId: call.requestId,
    generation: call.generation,
    key: call.key,
  };
  stripe.refunds.push(refund);
  return refund;
}

/** Le prestataire des remboursements, tel que la scène le joue. */
class FakeStripeRefunds implements E2eRefundBehaviour {
  async refund(providerRef: string, params: RefundParams): Promise<RefundIssuance> {
    const call: RefundCall = { ...params, paymentIntentId: providerRef };
    if (currentTransaction() !== undefined) {
      stripe.underTransaction += 1;
    }
    stripe.calls.push(call);
    const during = stripe.during;
    stripe.during = null;
    await during?.();
    const found = findOurs(providerRef, params);
    if (found !== undefined) {
      return { kind: "issued", refund: found };
    }
    const scripted = stripe.script.shift();
    if (scripted === undefined) {
      const remainder = remainderOf(providerRef);
      const amount = params.amountCents ?? remainder;
      return remainder <= 0 ? { kind: "nothing_left" } : this.issued(call, amount);
    }
    switch (scripted.kind) {
      case "unavailable":
        return { kind: "unavailable", reason: "ECONNRESET" };
      case "declined":
        return { kind: "declined", code: scripted.code };
      case "nothing_left":
        return { kind: "nothing_left" };
      case "issue_amount":
        return this.issued(call, scripted.amountCents);
    }
  }

  findRefund(providerRef: string, params: RefundLookupParams): Promise<RefundLookup> {
    const found = findOurs(providerRef, params);
    return Promise.resolve(
      found === undefined ? { kind: "none" } : { kind: "found", refund: found },
    );
  }

  private async issued(call: RefundCall, amountCents: number): Promise<RefundIssuance> {
    const refund = issue(call, amountCents);
    const after = stripe.afterIssue;
    stripe.afterIssue = null;
    if (after !== null) {
      await after(refund);
    }
    return { kind: "issued", refund };
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

export async function bootRefundScene() {
  const ctx = await bootScene([{ token: WallClock, value: wall }]);
  sceneCardProvider().refundBehaviour = new FakeStripeRefunds();
  return ctx;
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
    stripe.charged.set(order.intent, order.totalCents);
  }
  return order;
}

/**
 * **Un webhook de remboursement**, par la vraie commande de `card-payment`
 * (`RecordProviderEventCommand`) : le constat du bloc, sous ses verrous, puis
 * le canal. Un `re_…` émis par une demande porte sa métadonnée ; un `re_…` du
 * tableau de bord (`requestId` absent ou vide) n'en porte pas.
 *
 * 🔴 SANS `drain()`, à la différence de `recordCardEvent` : il est aussi joué
 * DEPUIS l'exécuteur (`stripe.afterIssue`), qui est lui-même du travail de
 * fond — l'attendre là, ce serait s'attendre soi-même. Les suites livrent
 * ensuite par `deliver()`.
 */
export async function webhook(
  paymentIntentId: string,
  refund: Pick<FakeRefund, "refundId" | "amountCents" | "createdAt"> &
    Partial<Pick<FakeRefund, "requestId" | "generation">>,
  status: CardRefundStatus,
): Promise<void> {
  const requestId = refund.requestId ?? "";
  const ctx = context();
  const provider = sceneCardProvider();
  const { rawBody, signature } = provider.sign({
    kind: "refund",
    eventId: provider.nextEventId(),
    eventType: "refund.updated",
    providerRef: paymentIntentId,
    refundId: refund.refundId,
    amountCents: refund.amountCents,
    currency: "eur",
    status,
    createdAt: refund.createdAt,
    ...(requestId === "" ? {} : { ours: { requestId, generation: refund.generation ?? 1 } }),
  });
  await ctx.app
    .get(CommandBus)
    .execute(new RecordProviderEventCommand(E2E_CARD_ACCOUNT, rawBody, signature));
}

/** L'exécuteur, tout de suite — comme le ferait le rappel d'après validation. */
export function issueNow(requestId: string): Promise<void> {
  return context().app.get(CommandBus).execute(new IssueCardRefundCommand(requestId));
}

/** Les paiements par carte de la commande — le sujet `order` du bloc. */
const ofOrder = (orderId: string) => ({ payment: { subjectType: "order", subjectId: orderId } });

/** La dernière demande de remboursement de la commande, ou `null`. */
export const refundRequestOf = (orderId: string) =>
  context().prisma.cardRefundRequest.findFirst({
    where: ofOrder(orderId),
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
  });

/** Toutes les demandes de la commande, de la plus ancienne à la plus récente. */
export const refundRequestsOf = (orderId: string) =>
  context().prisma.cardRefundRequest.findMany({
    where: ofOrder(orderId),
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
  });

/** Le carnet de la commande, dans l'ordre du constat. */
export const ledgerOf = (orderId: string) =>
  context().prisma.cardRefund.findMany({
    where: ofOrder(orderId),
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    select: { providerRef: true, amountCents: true, status: true },
  });

/** La cloche de `card-payment` (une par incident). */
export const attention = () =>
  context().prisma.staffNotification.findMany({
    where: { kind: "card_payment.refund_attention" },
    select: { subject: true, body: true },
  });

export const sweepRefunds = () =>
  context()
    .http()
    .post("/admin/card-payments/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN);

/** Fait échoir toute échéance : le mur avance d'un jour. */
export function advanceWallPastRetries(): void {
  wall.offsetMs += 24 * 60 * 60 * 1000;
}
