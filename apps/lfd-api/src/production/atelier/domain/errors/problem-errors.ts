import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Le rouge dit un nombre de pièces qui n'en est pas un. */
export class InvalidProblemOutputError extends DomainError {
  constructor(produced: number) {
    super(
      "production.problem.invalid_output",
      `Le rouge dit ${String(produced)} pièces sorties : il faut un nombre entier, zéro ou plus. Saisissez ce qui est réellement sorti du four.`,
    );
  }
}

/** Une raison trop longue : elle se lit d'un coup d'œil dans la Supervision. */
export class InvalidProblemReasonError extends DomainError {
  constructor(max: number) {
    super(
      "production.problem.invalid_reason",
      `La raison du rouge dépasse ${String(max)} caractères : raccourcissez-la, ou laissez-la vide.`,
    );
  }
}

/** « Marquer traité » vise un problème qu'aucune journée ne porte. */
export class ProductionProblemNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "production.problem.not_found",
      `Aucun problème du fournil ne porte l'identifiant ${id} : rechargez la Supervision avant de réessayer.`,
    );
  }
}

/** Un rouge qui dit plus que le compte du jour et que ce qui est déjà déclaré : une faute de frappe, le plus souvent. */
export class ProblemOutputAboveCountError extends DomainError {
  constructor(produced: number, bound: number) {
    super(
      "production.problem.above_count",
      `Le rouge dit ${String(produced)} pièces sorties, pour ${String(bound)} au plus attendues ou déjà déclarées : vérifiez la saisie. Un surplus réel se déclare par une fournée.`,
    );
  }
}

/** Le problème a changé entre sa lecture et son écriture. */
export class ProblemChangedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "production.problem.changed_meanwhile",
      "Ce problème vient d'être modifié par quelqu'un d'autre : rechargez la fiche, puis refaites le geste.",
    );
  }
}
