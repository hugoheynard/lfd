/**
 * **Qui annule** (plan `documentation/commandes/annulation/plan-annulation-de-commande.md`,
 * lot C6, C6.6). Le noyau de l'annulation est le même pour tous ; seul l'auteur
 * change ce qui s'écrit :
 *
 * - `staff` — la FICHE staff (`orders.cancelled_by`), jamais un `sub` ;
 * - `customer` — un client connecté : l'auteur d'une commande personnelle, ou
 *   un membre de la société (`orders.cancelled_by_user_id`) ;
 * - `guest` — le porteur du lien d'annulation d'une commande d'invité ; son
 *   `userId` est la fiche de l'invité, l'auteur de la commande.
 */
export type CancellationActor =
  | { readonly kind: "staff"; readonly staffUserId: string }
  | { readonly kind: "customer"; readonly userId: string }
  | { readonly kind: "guest"; readonly userId: string };

/** Les trois valeurs de `orders.cancelled_by_kind` — 🔴 écrites en base (CHECK), irréversibles. */
export type CancellationActorKind = CancellationActor["kind"];

/** La fiche staff si c'est l'équipe, sinon `null` : `cancelled_by` n'est JAMAIS un client. */
export function staffSheetOf(actor: CancellationActor): string | null {
  return actor.kind === "staff" ? actor.staffUserId : null;
}

/** Le client si c'est un client ou un invité, sinon `null`. */
export function customerUserOf(actor: CancellationActor): string | null {
  return actor.kind === "staff" ? null : actor.userId;
}
