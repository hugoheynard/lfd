import type { OrderCutoffDecision, OrderRevisionRefusal, PaymentStatus } from "@lfd/contracts";

import type { CancellationBlock, CancellationDecision } from "./order-cancellation.js";
import { revisionRefusalOf } from "./order-revision-refusal.js";
import { settlementRegimeOf } from "./settlement-regime.js";

/**
 * **La commande se modifie-t-elle, et sinon pourquoi** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, R1, §6, §9) — pure :
 * pas d'horloge, pas de port. Elle sert deux fois, comme `cancellationOf` : le
 * refus du geste (`OrderRevising.ensureRevisable`) et l'affichage des deux vues,
 * client et équipe, qui disent donc le même cas.
 */

/** Ce qui empêche la modification, dans l'ordre où la règle le cherche. */
export type RevisionBlock =
  /** R1 : la frontière de l'annulation (annulée, prête, inscrite, engagée, remboursement en vol). */
  | { readonly kind: "order"; readonly block: CancellationBlock }
  /** §9 : une commande payable par carte — le lot M2, à concevoir. */
  | { readonly kind: "card_settled" }
  /** Une commande d'avant les CGV figées n'a pas de quoi être recomposée. */
  | { readonly kind: "without_sales_terms" }
  /** Client seulement : le plan de la journée est arrêté. */
  | { readonly kind: "plan_closed"; readonly day: string }
  /** Client seulement : l'heure limite de la date est passée (`until` : celle qui l'est). */
  | { readonly kind: "past_cutoff"; readonly until: Date | null };

/** Les blocages qui valent pour tous, client et équipe — ce que le geste refuse d'emblée. */
export type StandingRevisionBlock = Extract<
  RevisionBlock,
  { readonly kind: "order" | "card_settled" | "without_sales_terms" }
>;

/**
 * Modifiable — avec l'heure limite qui s'appliquera au client, `null` pour
 * l'équipe ou sans limite —, ou bloquée.
 */
export type RevisionVerdict =
  | {
      readonly revisable: true;
      readonly until: Date | null;
      /** Plan A2 : inscrite au plan — l'équipe n'en change que les quantités. */
      readonly quantitiesOnly?: true;
    }
  | { readonly revisable: false; readonly block: RevisionBlock };

/** Ce que la règle lit de la commande, hors frontière de l'annulation. */
export interface RevisionStandingSubject {
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  readonly hasSalesTerms: boolean;
}

/**
 * **Ce qui vaut pour tous, client et équipe** : la frontière de l'annulation,
 * puis le régime (M1), puis les CGV figées. `null` : rien ne bloque.
 */
export function standingBlockOf(
  decision: CancellationDecision,
  subject: RevisionStandingSubject,
): StandingRevisionBlock | null {
  if (!decision.cancellable) {
    return { kind: "order", block: decision.block };
  }
  if (isCardSettlement(subject.paymentStatus, subject.totalCents)) {
    return { kind: "card_settled" };
  }
  return subject.hasSalesTerms ? null : { kind: "without_sales_terms" };
}

/** §9 : règlement par carte attendu (`due`) ou encaissé (`paid`). */
export function isCardSettlement(paymentStatus: PaymentStatus, totalCents: number): boolean {
  const regime = settlementRegimeOf(paymentStatus, totalCents);
  return regime === "due" || regime === "paid";
}

/**
 * Le verdict complet. `planClosedDay` et `cutoff` ne sont fournis que pour le
 * client (R1 : l'équipe ignore l'heure limite, et reçoit une commande « hors
 * plan » à date inchangée). La décision d'heure limite est celle que la
 * modification oppose (`decideStrictestOrderCutoff`) : ouverte, elle dit
 * jusqu'à quand ; en grâce ou fermée, elle refuse — une modification ne
 * dépense aucune dérogation.
 */
export function revisabilityOf(input: {
  readonly standing: StandingRevisionBlock | null;
  readonly planClosedDay: string | null;
  readonly cutoff: OrderCutoffDecision | null;
}): RevisionVerdict {
  if (input.standing !== null) {
    return { revisable: false, block: input.standing };
  }
  if (input.planClosedDay !== null) {
    return { revisable: false, block: { kind: "plan_closed", day: input.planClosedDay } };
  }
  if (input.cutoff === null) {
    return { revisable: true, until: null };
  }
  if (input.cutoff.status !== "open") {
    return { revisable: false, block: { kind: "past_cutoff", until: input.cutoff.limit } };
  }
  return { revisable: true, until: input.cutoff.limit };
}

export const CARD_SETTLED_REVISION_REFUSAL =
  "Commande réglée par carte : annulez-la et recommandez, ou demandez au commerce.";
export const NO_SALES_TERMS_REVISION_REFUSAL =
  "Cette commande ne porte pas les conditions de vente de sa passation : elle ne peut pas être modifiée. " +
  "Annulez-la et recommandez, ou signalez-le à l'équipe technique.";

/** La phrase d'un blocage, lue par l'équipe sous le bouton grisé. */
export function revisionBlockReasonOf(block: RevisionBlock): string {
  switch (block.kind) {
    case "order":
      return revisionRefusalOf(block.block);
    case "card_settled":
      return CARD_SETTLED_REVISION_REFUSAL;
    case "without_sales_terms":
      return NO_SALES_TERMS_REVISION_REFUSAL;
    case "plan_closed":
      return "Le plan du fournil est arrêté pour ce jour : la commande ne se modifie plus en ligne.";
    case "past_cutoff":
      return "L'heure limite de cette commande est passée : elle ne se modifie plus en ligne.";
  }
}

/** Le code dit au client — la boutique le met dans sa langue. */
export function customerRevisionRefusalOf(block: RevisionBlock): OrderRevisionRefusal {
  switch (block.kind) {
    case "order":
      return customerCodeOf(block.block);
    case "card_settled":
      return "card_settled";
    case "without_sales_terms":
      return "unavailable";
    case "plan_closed":
      return "in_preparation";
    case "past_cutoff":
      return "too_late";
  }
}

function customerCodeOf(block: CancellationBlock): OrderRevisionRefusal {
  switch (block.kind) {
    case "already_cancelled":
      return "cancelled";
    case "ready":
    case "fulfilled":
      return block.kind;
    case "inscribed":
    case "delivery_after_plan":
    case "delivery_bin":
      return "in_preparation";
    case "packed":
      return "ready";
    case "refund_in_flight":
    case "paid_just_now":
      return "payment_in_progress";
    case "invoiced":
    case "collecting":
    case "collected":
    case "written_off":
    case "returned_before":
    case "settled_otherwise":
      return "accounting";
    case "draft":
    case "engagement_unknown":
    case "voucher_remainder_engaged":
    case "voucher_remainder_cancelled":
    case "state_changed":
      return "unavailable";
  }
}
