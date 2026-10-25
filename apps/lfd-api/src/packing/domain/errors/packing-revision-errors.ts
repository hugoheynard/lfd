import { BusinessError, DomainError } from "../../../platform/shared/errors/app-error.js";

/**
 * **Les refus de la révision d'une feuille** (plan A2,
 * `documentation/commandes/modification/plan-a2-modifier-une-commande-inscrite.md`,
 * § 7) — l'équipe change les quantités d'une commande déjà inscrite.
 */

/** § 7, S1 : on ne descend pas sous ce qui est déjà au bac. */
export class RevisedDueBelowPackedError extends BusinessError {
  constructor(
    readonly reference: string,
    readonly productName: string,
    readonly packed: number,
    readonly due: number,
  ) {
    super(
      "packing.revision.below_packed",
      `« ${productName} » : ${String(packed)} pièce(s) sont déjà au bac de ${reference}, plus que les ${String(due)} demandées. ` +
        "Retirez d'abord du bac au poste de colisage, puis refaites la modification.",
    );
  }
}

/** Après l'arrêt, une révision ne change que les quantités (≥ 1) des articles de la feuille. */
export class RevisedDueMismatchError extends DomainError {
  constructor(readonly reference: string) {
    super(
      "packing.revision.lines_mismatch",
      `La modification de ${reference} change les articles de sa feuille de colisage, ou met une quantité sous 1 : ` +
        "après l'arrêt du plan, seules les quantités des articles déjà commandés se modifient. Rien n'a été modifié.",
    );
  }
}
