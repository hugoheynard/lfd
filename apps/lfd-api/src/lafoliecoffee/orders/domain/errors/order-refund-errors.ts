import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Pourquoi un remboursement constaté chez Stripe n'a PAS été écrit chez nous.
 *
 * - `currency` — il n'est pas en euros : nos commandes le sont toutes, et un
 *   cumul en deux devises ne se compare pas au total ;
 * - `exceeds_charge` — avec lui, les remboursements réussis dépasseraient le
 *   total encaissé ;
 * - `amount_changed` — un remboursement déjà noté revient avec un autre
 *   montant (Stripe ne le permet pas : le signaler plutôt que réécrire) ;
 * - `reversed_after_success` — un remboursement réussi se dirait annulé :
 *   Stripe n'annule qu'un remboursement encore en attente.
 */
export type RefundRejection =
  "currency" | "exceeds_charge" | "amount_changed" | "reversed_after_success";

const MESSAGES: Readonly<Record<RefundRejection, string>> = {
  currency:
    "Un remboursement Stripe n'est pas en euros : il n'a pas été noté sur la commande. " +
    "Vérifiez-le dans le tableau de bord Stripe.",
  exceeds_charge:
    "Les remboursements Stripe de cette commande dépasseraient ce qui a été encaissé : " +
    "le dernier n'a pas été noté. Comparez la commande et le paiement dans Stripe.",
  amount_changed:
    "Un remboursement Stripe déjà noté revient avec un autre montant : rien n'a été réécrit. " +
    "Vérifiez le remboursement dans le tableau de bord Stripe.",
  reversed_after_success:
    "Un remboursement Stripe déjà réussi se dit annulé : rien n'a été réécrit. " +
    "Vérifiez le remboursement dans le tableau de bord Stripe.",
};

/**
 * Un remboursement Stripe que l'agrégat refuse d'écrire. Refus métier (409),
 * mais **jamais renvoyé à Stripe** : le webhook répond 200, le refus se dit au
 * journal et à la cloche — un réessai de Stripe ne le rendrait pas plus vrai.
 */
export class RefundRejectedError extends BusinessError {
  constructor(readonly reason: RefundRejection) {
    super(`orders.refund.${reason}`, MESSAGES[reason]);
  }
}
