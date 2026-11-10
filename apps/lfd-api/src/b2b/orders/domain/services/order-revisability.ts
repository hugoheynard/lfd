import type { OrderCutoffDecision, OrderRevisionRefusal, PaymentStatus } from "@lfd/contracts";

import type {
  CancellationBlock,
  CancellationDecision,
} from "../../cancellation/domain/services/order-cancellation.js";
import { revisionRefusalOf } from "./order-revision-refusal.js";
import { settlementRegimeOf } from "./settlement-regime.js";

/**
 * **La commande se modifie-t-elle, et sinon pourquoi** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.3 « Les règles », R1) — pure :
 * pas d'horloge, pas de port. Elle sert deux fois, comme `cancellationOf` : le
 * refus du geste (`OrderRevising.ensureRevisable`) et l'affichage des deux vues,
 * client et équipe, qui disent donc le même cas.
 */

/** Ce qui empêche la modification, dans l'ordre où la règle le cherche. */
export type RevisionBlock =
  /** R1 : la frontière de l'annulation (annulée, prête, inscrite, engagée, remboursement en vol). */
  | { readonly kind: "order"; readonly block: CancellationBlock }
  /**
   * Une commande payable par carte (§ 2.7) : sur le chemin d'une DEMANDE (M4),
   * toute carte ; sur celui d'une modification, une carte pas encore
   * encaissée (`unsettled`) — encaissée, la hausse se paie, la baisse se rend
   * (plan S1), et l'agrégat trie le règlement.
   */
  | { readonly kind: "card_settled"; readonly unsettled: boolean }
  /** Une commande d'avant les CGV figées n'a pas de quoi être recomposée. */
  | { readonly kind: "without_sales_terms" }
  /** Client seulement : le plan de la journée est arrêté. */
  | { readonly kind: "plan_closed"; readonly day: string }
  /** Client seulement : l'heure limite de la date est passée (`until` : celle qui l'est). */
  | { readonly kind: "past_cutoff"; readonly until: Date | null }
  /**
   * Une commande prise sur la vitrine (plan du jour J, §13, lot L5) : le
   * circuit ne la sert plus — réglage fermé à cette porte, plus de créneau
   * au point, ou une journée qui n'est plus aujourd'hui. `reason` : la phrase
   * du refus que le geste lèverait.
   */
  | { readonly kind: "shelf_closed"; readonly reason: string };

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

/**
 * **Le chemin qui demande** (plan S2, R2 ter) : `revise` — la modification,
 * son devis, la hausse par carte ; `request` — le dépôt d'une demande M4, qui
 * garde `card_settled` sur TOUTE carte (R4).
 */
export type RevisionPurpose = "revise" | "request";

/** Ce que la règle lit de la commande, hors frontière de l'annulation. */
export interface RevisionStandingSubject {
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  readonly hasSalesTerms: boolean;
}

/**
 * **Ce qui vaut pour tous, client et équipe** : la frontière de l'annulation,
 * puis le régime (M1 ; plan S2, R2 ter, selon le chemin), puis les CGV figées.
 * `null` : rien ne bloque.
 */
export function standingBlockOf(
  decision: CancellationDecision,
  subject: RevisionStandingSubject,
  purpose: RevisionPurpose,
): StandingRevisionBlock | null {
  if (!decision.cancellable) {
    return { kind: "order", block: decision.block };
  }
  if (isCardSettlement(subject.paymentStatus, subject.totalCents)) {
    const unsettled = settlementRegimeOf(subject.paymentStatus, subject.totalCents) === "due";
    if (purpose === "request" || unsettled) {
      return { kind: "card_settled", unsettled: purpose === "revise" };
    }
  }
  return subject.hasSalesTerms ? null : { kind: "without_sales_terms" };
}

/** § 2.7 : règlement par carte attendu (`due`) ou encaissé (`paid`). */
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
    case "shelf_closed":
      return block.reason;
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
    case "shelf_closed":
      return "too_late";
  }
}

function customerCodeOf(block: CancellationBlock): OrderRevisionRefusal {
  switch (block.kind) {
    case "already_cancelled":
      return "cancelled";
    case "ready":
    case "fulfilled":
    case "partially_handed_over":
      return block.kind;
    case "remainder_handed_over":
      return "partially_handed_over";
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
