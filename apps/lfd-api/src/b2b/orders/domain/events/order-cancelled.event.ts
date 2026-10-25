import type { CustomerCancellationReasonCode, CustomerCancellationStage } from "@lfd/contracts";

import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { OrderSettlementPayloadError } from "../errors/order-settlement-payload.error.js";
import type { CancellingPrincipal } from "../ports/cancelling-member.reader.js";
import type { CancellationActorKind } from "../services/cancellation-actor.js";
import type { CancellableRegime } from "../services/order-cancellation.js";
import {
  afterInscriptionOf,
  authorOf,
  principalOf,
  refundOf,
  stageAppliedOf,
  voucherOf,
} from "./order-cancelled.payload.js";

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
 * Fait de domaine : **l'équipe a annulé une commande** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.5, 2026-10-12).
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
 *
 * Lot C1 des sous-comptes (`plan-commandes-des-sites.md`, §7.9, 2026-10-21) :
 * `cancelledFromPrincipal`, ADDITIF — le compte principal par lequel le client
 * a atteint la commande d'un site dont il n'est pas membre. Un fait sans la
 * clé se lit `null`.
 *
 * Plan A1 (lot A1.3, 2026-10-25) : `afterInscription` (la commande était
 * inscrite au compte à produire, et les ateliers l'ont retirée) et
 * `stageApplied` (jusqu'où l'annulation pouvait aller), ADDITIFS — un fait
 * d'avant se lit `false` / `production_plan`.
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
    readonly cancelledFromPrincipal: CancellingPrincipal | null = null,
    readonly afterInscription = false,
    readonly stageApplied: CustomerCancellationStage = "production_plan",
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
        cancelledFromPrincipal: this.cancelledFromPrincipal,
        afterInscription: this.afterInscription,
        stageApplied: this.stageApplied,
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
    const fromPrincipal = principalOf(payload["cancelledFromPrincipal"]);
    const afterInscription = afterInscriptionOf(payload["afterInscription"]);
    const stageApplied = stageAppliedOf(payload["stageApplied"]);
    if (
      orderId === null ||
      orderNumber === null ||
      placedByUserId === null ||
      (regime !== "free" && regime !== "due" && regime !== "account" && regime !== "paid") ||
      voucher === undefined ||
      refund === undefined ||
      author === undefined ||
      fromPrincipal === undefined ||
      afterInscription === undefined ||
      stageApplied === undefined
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
      fromPrincipal,
      afterInscription,
      stageApplied,
    );
  }
}
