import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **révision d'une commande inscrite** au fournil (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7). Le commerce les refuse avant ; ces gardes tiennent la journée si un
 * appelant les oubliait.
 */

/** La commande n'est pas sur le plan de la journée qu'on révise. */
export class RevisedOrderNotInPlanError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly serviceDay: string,
  ) {
    super(
      "production.revision.not_in_plan",
      `La commande n'est pas inscrite au plan du ${serviceDay} : ses quantités ne se révisent pas au fournil. ` +
        "Rechargez la commande, puis réessayez.",
    );
  }
}

/** Après l'arrêt, une révision ne change que les quantités (≥ 1) des articles déjà commandés. */
export class RevisedLinesMismatchError extends DomainError {
  constructor(readonly orderId: string) {
    super(
      "production.revision.lines_mismatch",
      "Après l'arrêt du plan, seules les quantités des articles déjà commandés se modifient, " +
        "et chacune reste d'au moins 1 : ajouter ou retirer un article ne se fait plus. Rien n'a été modifié.",
    );
  }
}

/**
 * **Inscrite un autre jour** que celui qu'on révise. Une révision après
 * l'arrêt ne change pas de jour (plan A2, § 7) : le fournil révise le dû au
 * plan du jour où la commande est INSCRITE. Jusqu'au 2026-11-03, ce jour
 * n'était pas comparé à celui demandé — le guichet révisait le plan du jour
 * demandé, où la commande n'est pas, et la journée refusait plus bas sans
 * dire où elle était vraiment.
 */
export class RevisedOrderInscribedElsewhereError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly requestedDay: string,
    readonly inscribedDay: string,
  ) {
    super(
      "production.revision.inscribed_another_day",
      `La commande est inscrite au plan du ${inscribedDay}, pas à celui du ${requestedDay} : ses quantités se révisent sur ce jour-là seulement. ` +
        "Rechargez la commande : sa date a peut-être changé entre-temps. Rien n'a été modifié.",
    );
  }
}
