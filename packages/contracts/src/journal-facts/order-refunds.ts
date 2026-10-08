import { z } from "zod";

import { cents, fact, instant, named, payload, subjectLabel } from "./fact.js";

/**
 * **Les remboursements Stripe constatés** (plan
 * `documentation/comptabilite/facturation/plan-facture-carte-et-remboursements.md`,
 * lot R1). On les CONSTATE : le geste reste dans le tableau de bord Stripe, et
 * l'auteur de la ligne est le système.
 *
 * Le sujet est la COMMANDE, son libellé son numéro. 🔴 Aucun identifiant
 * Stripe dans la charge : le journal n'en porte aucun (pas même le `pi_…`,
 * vérifié le 2026-10-08), et le numéro de commande suffit à retrouver le
 * paiement chez Stripe.
 */

/** Les statuts d'un remboursement chez Stripe (`Refund.status`). */
const refundStatus = () =>
  z.enum(["pending", "requires_action", "succeeded", "failed", "canceled"]);

export const ORDER_REFUND_FACTS = {
  /**
   * Un remboursement est noté, ou a changé de statut. `refundedCents` est le
   * cumul des remboursements RÉUSSIS après ce constat.
   */
  "order.refund_recorded": fact(
    payload({
      subjectLabel: subjectLabel(),
      amountCents: cents(),
      refundedCents: cents(),
      status: refundStatus(),
    }),
  ),
  /** Le cumul des remboursements réussis atteint le total : la commande est remboursée. */
  "order.fully_refunded": fact(payload({ subjectLabel: subjectLabel(), refundedCents: cents() })),
  /**
   * Un remboursement Stripe que la commande refuse : rien n'a été écrit. La
   * cloche du back-office sonne avec lui.
   */
  "order.refund_rejected": fact(
    payload({
      subjectLabel: subjectLabel(),
      amountCents: cents(),
      currency: z.string().min(1),
      status: refundStatus(),
      reason: z.enum(["currency", "exceeds_charge", "amount_changed", "reversed_after_success"]),
    }),
  ),
  /**
   * Un remboursement réussi reste SANS avoir automatique (lot E5b) : la
   * facture qui porte la commande est celle du mois (`account_invoice` — le
   * remboursement d'un bon au compte dit autre chose que la vente, A11), ou
   * il dépasse ce que la facture porte encore (`exceeds_invoice`). L'avoir
   * est alors un geste humain ; la cloche sonne avec lui.
   */
  "order.refund_not_credited": fact(
    payload({
      subjectLabel: subjectLabel(),
      amountCents: cents(),
      invoice: named("invoice"),
      reason: z.enum(["account_invoice", "exceeds_invoice"]),
    }),
  ),
  /**
   * La facture carte de la commande n'a pas pu être émise (lot E5a) :
   * acheteur sans SIREN ou sans TVA, pas d'émetteur, bon incohérent…
   * `message` dit le refus en clair ; l'écran Comptabilité la montre et
   * « Réessayer » la rejoue.
   */
  "order.card_invoice_blocked": fact(
    payload({ subjectLabel: subjectLabel(), message: z.string().min(1) }),
  ),
} as const;

/**
 * **Un remboursement sur un paiement qu'aucune commande ne porte** — un lien
 * libre, le plus souvent (arbitrage A11) : noté, la cloche sonne, aucun avoir.
 *
 * Le sujet est le remboursement lui-même, sous son `re_…` : c'est le seul
 * nom que ce paiement ait chez nous, et celui qu'on cherche dans Stripe.
 */
export const PAYMENT_REFUND_FACTS = {
  "payment_refund.unmatched": fact(
    payload({
      amountCents: cents(),
      currency: z.string().min(1),
      status: refundStatus(),
      refundedAt: instant(),
    }),
  ),
} as const;
