import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";
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

/** Nom STABLE du fait, clé de routage vers `@DurableHandler`. */
export const ORDER_CANCELLED = "order.cancelled";

/**
 * Fait de domaine : **l'équipe a annulé une commande** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3.5, 2026-10-12).
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
 */
export class OrderCancelledEvent implements DurableEvent {
  constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    /** Le client — le sujet du témoin au journal. */
    readonly placedByUserId: string,
    /** La fiche staff qui a annulé — jamais un `sub`. */
    readonly cancelledBy: string,
    readonly reason: string,
    readonly regime: CancellableRegime,
    readonly voucher: CancelledOrderVoucher | null,
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
    const cancelledBy = text("cancelledBy");
    const reason = text("reason");
    const regime = payload["regime"];
    const voucher = voucherOf(payload["voucher"]);
    if (
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      cancelledBy === null ||
      reason === null ||
      (regime !== "free" && regime !== "due" && regime !== "account") ||
      voucher === undefined
    ) {
      throw new OrderSettlementPayloadError(ORDER_CANCELLED);
    }
    return new OrderCancelledEvent(
      orderId,
      orderNumber,
      placedByUserId,
      cancelledBy,
      reason,
      regime,
      voucher,
    );
  }
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
