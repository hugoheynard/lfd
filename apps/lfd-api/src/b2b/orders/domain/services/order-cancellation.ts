import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

import type { RefundPosition } from "../entities/order-refund.js";
import type { AccountEngagement } from "../ports/account-order-engagement.js";
import type { CancellationSubject } from "../ports/cancellation-subject.reader.js";
import type { CancellationAllowance } from "./cancellation-allowance.js";
import {
  engagementBlockOf,
  engagementRefusalOf,
  type EngagementBlock,
} from "./order-cancellation-account.js";
import { PAID_JUST_NOW_REFUSAL, refundInFlightRefusalOf } from "./order-cancellation-refund.js";
import {
  remainderCancelledRefusalOf,
  remainderEngagedRefusalOf,
} from "./order-cancellation-voucher.js";
import { settlementRegimeOf } from "./settlement-regime.js";

/**
 * **La règle de l'annulation staff** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.2, C3.3, C3.7) —
 * pure, sur le modèle de `packingBlocker` : pas d'horloge, pas de port.
 *
 * Elle sert deux fois, et c'est pour ça qu'elle est une fonction : le refus du
 * geste (sous verrou) et l'affichage du détail staff (sans verrou). Les deux
 * disent donc la même phrase.
 */

/** L'état d'une commande, réduit à ce dont la règle a besoin. */
export interface CancellationState {
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  /** Le jour de service `AAAA-MM-JJ`, ou `null` (commande sans jour). */
  readonly serviceDay: string | null;
  /** L'instant d'une annulation STAFF ; `null` pour une annulation automatique. */
  readonly cancelledAt: Date | null;
  /**
   * Le jour où le fournil l'a inscrite, ou `null`. Inconnu avant la
   * transaction : le guichet du fournil le tranche sous verrou.
   */
  readonly inscribedDay: string | null;
  /**
   * Ce que la comptabilité a déjà fait d'une commande au compte (lot C5,
   * C5.5). `null` n'est admis que hors régime `account` : au compte, c'est
   * une incohérence, et la règle refuse (`engagement_unknown`), jamais
   * « annulable » (S6).
   */
  readonly engagement: AccountEngagement | null;
  /** Lot C4 : le reste à rendre et ce qui est en vol, lus au carnet. */
  readonly refunds: RefundPosition;
}

/**
 * L'état que la règle lit, tiré d'une commande. `inscribedDay` vient du
 * fournil ; `null` quand on ne le lui a pas encore demandé (le geste le
 * tranche sous verrou, par son guichet).
 */
export function cancellationStateOf(
  subject: CancellationSubject,
  inscribedDay: string | null,
  engagement: AccountEngagement | null,
): CancellationState {
  return {
    status: subject.status,
    paymentStatus: subject.paymentStatus,
    totalCents: subject.totalCents,
    serviceDay: subject.serviceDay,
    cancelledAt: subject.cancelledAt,
    inscribedDay,
    engagement,
    refunds: subject.refunds,
  };
}

/** Ce qui empêche l'annulation, dans l'ordre où la règle le cherche (C3.3). */
export type CancellationBlock =
  | { readonly kind: "already_cancelled"; readonly at: Date | null }
  | { readonly kind: "draft" }
  | { readonly kind: "ready" }
  | { readonly kind: "fulfilled" }
  /** Lot C5 : au compte, et déjà engagée en comptabilité (C5.6). */
  | EngagementBlock
  /** Lot C4 : un remboursement attend encore son issue chez Stripe (C4.4). */
  | { readonly kind: "refund_in_flight"; readonly amountCents: number }
  /**
   * Lot C4 : une carte attendue a abouti pendant le clic (`cancelIntent` →
   * `already_paid`). Lu par le geste, pas par {@link cancellationOf}.
   */
  | { readonly kind: "paid_just_now" }
  | { readonly kind: "inscribed"; readonly day: string | null }
  /**
   * Lot C3b, cas 5 : le reste du bon a servi sur `order`, vivante ;
   * `otherCancellable` dit si celle-là s'annule — la phrase ne propose que le
   * possible. Lu par la restitution du bon, pas par {@link cancellationOf}.
   */
  | {
      readonly kind: "voucher_remainder_engaged";
      readonly remainderValueCents: number;
      readonly order: { readonly id: string; readonly number: string };
      readonly otherCancellable: boolean;
    }
  /** Lot C3b, cas 6 : le reste du bon a été annulé par l'équipe. */
  | { readonly kind: "voucher_remainder_cancelled"; readonly remainderValueCents: number };

/**
 * Les régimes annulables : total nul, carte non payée, au compte tant que la
 * comptabilité n'a rien engagé (lot C5), et — depuis le lot C4 — payée par
 * carte, remboursement compris. 🔴 `account` et `paid` sont des VALEURS écrites
 * dans le fait `order.cancelled` : irréversibles dès la première annulation en
 * production (C5.7, C4.8).
 */
export type CancellableRegime = "free" | "due" | "account" | "paid";

/** La décision : annulable sous tel régime, ou bloquée, et pourquoi. */
export type CancellationDecision =
  | { readonly cancellable: true; readonly regime: CancellableRegime }
  | { readonly cancellable: false; readonly block: CancellationBlock };

/**
 * Annulable, et sous quel régime — ou ce qui l'empêche.
 *
 * Ordre du plan (C3.3, C5.2, C4.2) : statut annulé, statuts sans retour,
 * remboursement en vol d'une payée, engagement comptable d'une commande au
 * compte (facturée, engagée, rejetée avant), inscrite. Une payée s'annule
 * depuis le lot C4 : la branche qui la refusait est INVERSÉE (C4.11 bis). `confirmed` et `in_production` se lisent comme « inscrite » : le
 * seul chemin qui écrit `confirmed` est l'absorption par le plan du soir
 * (`absorbIntoPlan`, vérifié le 2026-10-12), et rien n'écrit `in_production`.
 */
export function cancellationOf(
  state: CancellationState,
  allowance: CancellationAllowance,
): CancellationDecision {
  const byStatus = statusBlock(state);
  if (byStatus !== null) {
    return { cancellable: false, block: byStatus };
  }
  const regime = settlementRegimeOf(state.paymentStatus, state.totalCents);
  if (regime === "paid" && state.refunds.inFlightCents > 0) {
    return {
      cancellable: false,
      block: { kind: "refund_in_flight", amountCents: state.refunds.inFlightCents },
    };
  }
  if (regime === "account") {
    const engaged = engagementBlockOf(state.engagement);
    if (engaged !== null) {
      return { cancellable: false, block: engaged };
    }
  }
  if (state.inscribedDay !== null || state.status !== "placed") {
    const day = state.inscribedDay ?? state.serviceDay;
    return { cancellable: false, block: inscribedBlockUnder(allowance, day) };
  }
  return { cancellable: true, regime };
}

/**
 * Le refus « inscrite », selon l'autorisation.
 *
 * 🔴 **A1.1 (2026-10-25) : `before_packing` ne lève PAS encore ce refus.**
 * Retirer une commande inscrite demande les guichets du fournil et du
 * colisage (lot A1.2, plan A1 § 2), qui n'existent pas encore : jusque-là,
 * l'issue reste le refus d'avant, et choisir `ready` au réglage ne change
 * rien en production.
 */
function inscribedBlockUnder(
  allowance: CancellationAllowance,
  day: string | null,
): CancellationBlock {
  switch (allowance.allowance) {
    case "before_inscription":
    case "before_packing":
      return { kind: "inscribed", day };
  }
}

/** Ce qui empêche d'annuler — ou `null` si rien. Cf. {@link cancellationOf}. */
export function cancellationBlocker(
  state: CancellationState,
  allowance: CancellationAllowance,
): CancellationBlock | null {
  const decision = cancellationOf(state, allowance);
  return decision.cancellable ? null : decision.block;
}

function statusBlock(state: CancellationState): CancellationBlock | null {
  switch (state.status) {
    case "cancelled":
      return { kind: "already_cancelled", at: state.cancelledAt };
    case "draft":
      return { kind: "draft" };
    case "ready":
      return { kind: "ready" };
    case "fulfilled":
      return { kind: "fulfilled" };
    default:
      return null;
  }
}

const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/Paris",
});
const SHORT_TIME = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/** `AAAA-MM-JJ` → `JJ/MM`, sans fuseau : un jour de service n'en a pas. */
function serviceDayShort(day: string): string {
  const [, month = "", dayOfMonth = ""] = day.split("-");
  return `${dayOfMonth}/${month}`;
}

/**
 * **La phrase du refus**, lue par du personnel sans le code sous les yeux :
 * elle nomme le cas et le geste de sortie (C3.7).
 */
export function cancellationRefusalOf(block: CancellationBlock): string {
  switch (block.kind) {
    case "already_cancelled":
      return block.at === null
        ? "Cette commande est déjà annulée."
        : `Cette commande est déjà annulée (le ${SHORT_DAY.format(block.at)} à ${SHORT_TIME.format(block.at)}).`;
    case "draft":
      return "Cette commande est un brouillon : elle n'est pas passée, il n'y a rien à annuler.";
    case "ready":
      return "Cette commande est déjà prête : elle ne s'annule plus. Voyez avec le fournil.";
    case "fulfilled":
      return "Cette commande est déjà retirée : elle ne s'annule plus.";
    case "invoiced":
    case "collecting":
    case "collected":
    case "written_off":
    case "returned_before":
    case "settled_otherwise":
    case "engagement_unknown":
      return engagementRefusalOf(block);
    case "refund_in_flight":
      return refundInFlightRefusalOf(block.amountCents);
    case "paid_just_now":
      return PAID_JUST_NOW_REFUSAL;
    case "voucher_remainder_engaged":
      return remainderEngagedRefusalOf(
        block.remainderValueCents,
        block.order.number,
        block.otherCancellable,
      );
    case "voucher_remainder_cancelled":
      return remainderCancelledRefusalOf(block.remainderValueCents);
    case "inscribed":
      return block.day === null
        ? "Le fournil a déjà inscrit cette commande au compte à produire : elle sera fabriquée. Voyez avec le fournil."
        : `Le fournil a déjà inscrit cette commande au compte à produire du ${serviceDayShort(block.day)} : elle sera fabriquée. Voyez avec le fournil.`;
  }
}
