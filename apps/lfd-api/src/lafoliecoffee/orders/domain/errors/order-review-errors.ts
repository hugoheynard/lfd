import { instantToLocal } from "@lfd/contracts";

import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** « le 21/11 à 14:30 » à Paris : l'instant que lit l'équipe. */
function parisMomentOf(at: Date): string {
  const { day, time } = instantToLocal(at);
  const [, month = "", dayOfMonth = ""] = day.split("-");
  return `le ${dayOfMonth}/${month} à ${time}`;
}

/**
 * **La commande n'est pas de celles qu'on vise** : saisie par l'équipe, pour
 * un particulier, annulée, ou passée avant la mise en service. `BusinessError`
 * (409) : la demande est bien formée, c'est la commande qui s'y oppose.
 */
export class OrderReviewOutOfScopeError extends BusinessError {
  constructor(
    readonly reference: string,
    reason: string,
  ) {
    super(
      "orders.review.out_of_scope",
      `La commande ${reference} ne se vise pas : ${reason}. Le visa ne concerne que les commandes ` +
        "qu'un client pro a passées lui-même.",
    );
  }
}

/** **Déjà visée** — un seul visa en cours par commande. */
export class OrderAlreadyReviewedError extends BusinessError {
  constructor(
    readonly reference: string,
    readonly reviewedAt: Date,
  ) {
    super(
      "orders.review.already_reviewed",
      `La commande ${reference} est déjà visée (${parisMomentOf(reviewedAt)}) et n'a pas été ` +
        "modifiée depuis. Pour la viser à nouveau, retirez d'abord ce visa.",
    );
  }
}

/**
 * **Visée à l'instant par quelqu'un d'autre** — la course entre deux
 * commerciaux, arbitrée par l'index unique de la base.
 */
export class OrderReviewRaceError extends BusinessError {
  constructor(readonly orderId: string) {
    super(
      "orders.review.already_reviewed",
      "Cette commande vient d'être visée par un autre membre de l'équipe : rechargez-la pour " +
        "voir qui l'a visée.",
    );
  }
}

/** **Aucun visa à retirer** — la commande n'en porte pas, ou il vient d'être retiré. */
export class OrderNotReviewedError extends BusinessError {
  constructor(readonly reference: string) {
    super(
      "orders.review.not_reviewed",
      `La commande ${reference} ne porte aucun visa en cours : il n'y a rien à retirer. ` +
        "Rechargez la commande pour voir son état.",
    );
  }
}

/** **Note trop longue** — une note de visa se lit d'un coup d'œil. */
export class OrderReviewNoteTooLongError extends DomainError {
  constructor(readonly maxLength: number) {
    super(
      "orders.review.note_too_long",
      `La note du visa dépasse ${maxLength} caractères : raccourcissez-la.`,
    );
  }
}
