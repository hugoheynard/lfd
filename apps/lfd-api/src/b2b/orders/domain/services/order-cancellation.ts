import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

import type { CancellationSubject } from "../ports/cancellation-subject.reader.js";
import {
  remainderCancelledRefusalOf,
  remainderEngagedRefusalOf,
} from "./order-cancellation-voucher.js";
import { settlementRegimeOf } from "./settlement-regime.js";

/**
 * **La règle de l'annulation staff** (plan
 * `documentation/order/plan-annulation-de-commande.md`, C3.2, C3.3, C3.7) —
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
}

/**
 * L'état que la règle lit, tiré d'une commande. `inscribedDay` vient du
 * fournil ; `null` quand on ne le lui a pas encore demandé (le geste le
 * tranche sous verrou, par son guichet).
 */
export function cancellationStateOf(
  subject: CancellationSubject,
  inscribedDay: string | null,
): CancellationState {
  return {
    status: subject.status,
    paymentStatus: subject.paymentStatus,
    totalCents: subject.totalCents,
    serviceDay: subject.serviceDay,
    cancelledAt: subject.cancelledAt,
    inscribedDay,
  };
}

/** Ce qui empêche l'annulation, dans l'ordre où la règle le cherche (C3.3). */
export type CancellationBlock =
  | { readonly kind: "already_cancelled"; readonly at: Date | null }
  | { readonly kind: "draft" }
  | { readonly kind: "ready" }
  | { readonly kind: "fulfilled" }
  | { readonly kind: "account" }
  | { readonly kind: "paid" }
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

/** Les deux régimes annulables par ce lot : total nul, ou carte non payée. */
export type CancellableRegime = "free" | "due";

/** La décision : annulable sous tel régime, ou bloquée, et pourquoi. */
export type CancellationDecision =
  | { readonly cancellable: true; readonly regime: CancellableRegime }
  | { readonly cancellable: false; readonly block: CancellationBlock };

/**
 * Annulable, et sous quel régime — ou ce qui l'empêche.
 *
 * Ordre du plan (C3.3) : statut annulé, statuts sans retour, compte, payée,
 * inscrite. `confirmed` et `in_production` se lisent comme « inscrite » : le
 * seul chemin qui écrit `confirmed` est l'absorption par le plan du soir
 * (`absorbIntoPlan`, vérifié le 2026-10-12), et rien n'écrit `in_production`.
 */
export function cancellationOf(state: CancellationState): CancellationDecision {
  const byStatus = statusBlock(state);
  if (byStatus !== null) {
    return { cancellable: false, block: byStatus };
  }
  const regime = settlementRegimeOf(state.paymentStatus, state.totalCents);
  if (regime === "account" || regime === "paid") {
    return { cancellable: false, block: { kind: regime } };
  }
  if (state.inscribedDay !== null || state.status !== "placed") {
    const day = state.inscribedDay ?? state.serviceDay;
    return { cancellable: false, block: { kind: "inscribed", day } };
  }
  return { cancellable: true, regime };
}

/** Ce qui empêche d'annuler — ou `null` si rien. Cf. {@link cancellationOf}. */
export function cancellationBlocker(state: CancellationState): CancellationBlock | null {
  const decision = cancellationOf(state);
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
    case "account":
      return (
        "Cette commande est passée au compte de la société. L'annulation des commandes " +
        "au compte n'existe pas encore : voyez avec la comptabilité."
      );
    case "paid":
      return (
        "Cette commande a été payée par carte en ligne. L'annulation avec remboursement " +
        "n'existe pas encore : remboursez depuis Stripe, puis prévenez le client."
      );
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
