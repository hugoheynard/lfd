import {
  CUSTOMER_CANCELLATION_REASON_CODES,
  type CustomerCancellationReasonCode,
} from "@lfd/contracts";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";
import type { CancellationActorKind } from "../services/cancellation-actor.js";
import type { CancellableRegime } from "../services/order-cancellation.js";

/**
 * Ce que l'annulation a fait du bon de fidélité de la commande (lot C3b,
 * C3b.6) — `null` dans le fait quand la commande n'en portait pas, ou que la
 * restitution n'a rien eu à faire. Centimes HT, l'unité du bon.
 */
export interface CancelledOrderVoucher {
  readonly outcome: "returned" | "merged" | "lapsed";
  readonly voucherValueCents: number;
  readonly remainderValueCents: number | null;
  readonly expiresAt: Date;
}

/**
 * L'argent que l'annulation d'une commande payée a promis de rendre (lot C4,
 * C4.8) — `null` hors régime `paid`, ou quand il n'y avait plus rien à rendre.
 * Centimes TTC, l'unité de l'encaissement.
 */
export interface CancelledOrderRefund {
  readonly announcedCents: number;
}

/** Le délai qu'un particulier s'est vu appliquer (lot C6, C6.5) — figé au fait. */
export interface CancellationPolicyApplied {
  readonly hoursBefore: number;
}

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_CANCELLED = "order.cancelled";

/**
 * Fait de domaine : **l'équipe a annulé une commande** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C3.5, 2026-10-12).
 *
 * Durable, écrit dans l'unité de travail qui annule : l'annulation, le bon
 * rendu et ce fait partent ensemble, ou rien. Publié une fois, au
 * franchissement — un rejeu de transaction ou un second clic ne franchit pas.
 * Clé `order.cancelled:<orderId>` : une commande ne s'annule qu'une fois.
 *
 * Abonnés : le journal (`order.cancelled`) et le courriel au client.
 *
 * Le motif voyage avec le fait pour le journal ; le courriel ne le lit pas.
 *
 * `voucher` a REMPLACÉ le booléen `voucherReturned` (lot C3b, 2026-10-12),
 * sans lecture de l'ancienne forme : C3 n'avait jamais été promu sur `main`,
 * aucun fait `order.cancelled` n'existait en production (plan, C3b.6). Si un
 * jour C3 part sans C3b, cette lecture redevient nécessaire.
 *
 * `refund` (lot C4, C4.8) est ajouté de façon ADDITIVE : un fait sans la clé se
 * lit `null` — si C3 part avant C4, ses faits restent lisibles.
 *
 * Lot C6 (C6.6, S8) : le CLIENT peut annuler. `cancelledByKind`,
 * `cancelledByUserId`, `reasonCode` et `policy` sont ADDITIFS : un fait d'avant
 * C6 n'en a aucun et se lit `staff`, comme il l'était. Pour un client,
 * `cancelledBy` (la fiche staff) est `null`, et `reason` peut l'être (motif
 * facultatif, Q-C6.1).
 */
export class OrderCancelledEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client — le sujet du témoin au journal. */
    readonly placedByUserId: string,
    /** La fiche staff qui a annulé — jamais un `sub` ; `null` quand c'est un client. */
    readonly cancelledBy: string | null,
    readonly reason: string | null,
    readonly regime: CancellableRegime,
    readonly voucher: CancelledOrderVoucher | null,
    readonly refund: CancelledOrderRefund | null = null,
    readonly cancelledByKind: CancellationActorKind = "staff",
    /** Le client qui a annulé (l'auteur, ou un membre de la société) ; `null` pour l'équipe. */
    readonly cancelledByUserId: string | null = null,
    readonly reasonCode: CustomerCancellationReasonCode | null = null,
    readonly policy: CancellationPolicyApplied | null = null,
  ) {}

  durableFact(): DurableFact {
    return {
      type: ORDER_CANCELLED,
      key: `${ORDER_CANCELLED}:${this.orderId}`,
      payload: {
        orderId: this.orderId,
        orderNumber: this.orderNumber,
        placedByUserId: this.placedByUserId,
        cancelledBy: this.cancelledBy,
        reason: this.reason,
        regime: this.regime,
        voucher:
          this.voucher === null
            ? null
            : { ...this.voucher, expiresAt: this.voucher.expiresAt.toISOString() },
        refund: this.refund,
        cancelledByKind: this.cancelledByKind,
        cancelledByUserId: this.cancelledByUserId,
        reasonCode: this.reasonCode,
        policy: this.policy,
      },
    };
  }

  /** @throws {OrderSettlementPayloadError} payload hors forme — faute d'émetteur. */
  static fromPayload(payload: Readonly<Record<string, unknown>>): OrderCancelledEvent {
    const text = (key: string): string | null => {
      const value = payload[key];
      return typeof value === "string" && value.length > 0 ? value : null;
    };
    const orderId = text("orderId");
    const orderNumber = text("orderNumber");
    const placedByUserId = text("placedByUserId");
    const regime = payload["regime"];
    const voucher = voucherOf(payload["voucher"]);
    const refund = refundOf(payload["refund"]);
    const author = authorOf(payload, text);
    if (
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      (regime !== "free" && regime !== "due" && regime !== "account" && regime !== "paid") ||
      voucher === undefined ||
      refund === undefined ||
      author === undefined
    ) {
      throw new OrderSettlementPayloadError(ORDER_CANCELLED);
    }
    return new OrderCancelledEvent(
      orderId,
      orderNumber,
      placedByUserId,
      author.cancelledBy,
      author.reason,
      regime,
      voucher,
      refund,
      author.kind,
      author.userId,
      author.reasonCode,
      author.policy,
    );
  }
}

interface CancellationAuthorPayload {
  readonly kind: CancellationActorKind;
  readonly cancelledBy: string | null;
  readonly userId: string | null;
  readonly reason: string | null;
  readonly reasonCode: CustomerCancellationReasonCode | null;
  readonly policy: CancellationPolicyApplied | null;
}

/**
 * Qui a annulé, et pourquoi — `undefined` : hors forme. Sans `cancelledByKind`
 * (fait d'avant C6, S8) : l'équipe, avec sa fiche et son motif obligatoires.
 */
function authorOf(
  payload: Readonly<Record<string, unknown>>,
  text: (key: string) => string | null,
): CancellationAuthorPayload | undefined {
  const rawKind = payload["cancelledByKind"];
  const kind = rawKind === undefined || rawKind === null ? "staff" : rawKind;
  const reasonCode = reasonCodeOf(payload["reasonCode"]);
  const policy = policyOf(payload["policy"]);
  if (reasonCode === undefined || policy === undefined) {
    return undefined;
  }
  const cancelledBy = text("cancelledBy");
  const reason = text("reason");
  if (kind === "staff") {
    return cancelledBy === null || reason === null
      ? undefined
      : { kind, cancelledBy, userId: null, reason, reasonCode, policy };
  }
  const userId = text("cancelledByUserId");
  if ((kind !== "customer" && kind !== "guest") || userId === null) {
    return undefined;
  }
  return { kind, cancelledBy: null, userId, reason, reasonCode, policy };
}

function reasonCodeOf(raw: unknown): CustomerCancellationReasonCode | null | undefined {
  if (raw === undefined || raw === null) {
    return null;
  }
  return CUSTOMER_CANCELLATION_REASON_CODES.find((code) => code === raw);
}

function policyOf(raw: unknown): CancellationPolicyApplied | null | undefined {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object") {
    return undefined;
  }
  const hours = "hoursBefore" in raw ? Reflect.get(raw, "hoursBefore") : undefined;
  return typeof hours === "number" && Number.isInteger(hours) && hours >= 0
    ? { hoursBefore: hours }
    : undefined;
}

/** `undefined` : hors forme. Une clé absente (fait d'avant C4) se lit `null`. */
function refundOf(raw: unknown): CancelledOrderRefund | null | undefined {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "object") {
    return undefined;
  }
  const announced = "announcedCents" in raw ? Reflect.get(raw, "announcedCents") : undefined;
  if (typeof announced !== "number" || !Number.isInteger(announced) || announced <= 0) {
    return undefined;
  }
  return { announcedCents: announced };
}

/** `undefined` : hors forme. */
function voucherOf(raw: unknown): CancelledOrderVoucher | null | undefined {
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "object" || raw === undefined) {
    return undefined;
  }
  const field = (key: string): unknown => (key in raw ? Reflect.get(raw, key) : undefined);
  const outcome = field("outcome");
  const value = field("voucherValueCents");
  const remainder = field("remainderValueCents");
  const expiresAt = field("expiresAt");
  if (
    (outcome !== "returned" && outcome !== "merged" && outcome !== "lapsed") ||
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !(remainder === null || (typeof remainder === "number" && Number.isInteger(remainder))) ||
    typeof expiresAt !== "string"
  ) {
    return undefined;
  }
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) {
    return undefined;
  }
  return { outcome, voucherValueCents: value, remainderValueCents: remainder, expiresAt: at };
}
