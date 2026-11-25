import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Une raison de rouge trop longue : elle se lit d'un coup d'œil dans la Supervision. */
export class InvalidStepReasonError extends DomainError {
  constructor(max: number) {
    super(
      "production.line_step.invalid_reason",
      `La raison du rouge de l'étape dépasse ${String(max)} caractères : raccourcissez-la, ou laissez-la vide.`,
    );
  }
}

/** Le poste finit la ligne : il déclare par « Fait », jamais par une étape. */
export class FinishingWorkstationIsNotAStepError extends BusinessError {
  constructor(sku: string) {
    super(
      "production.line_step.finishing_workstation",
      `Ce poste finit la ligne « ${sku} » : il la déclare par « Fait » ou « Problème », pas par une étape. Rechargez la fiche si la carte des postes vient de changer.`,
    );
  }
}

/** Le poste n'est pas, sur la carte courante, un poste du produit de la ligne. */
export class WorkstationNotOnLineError extends BusinessError {
  constructor(sku: string) {
    super(
      "production.line_step.workstation_not_on_line",
      `Ce poste n'est pas une étape de la ligne « ${sku} » sur la carte des postes : rechargez la fiche, la carte a pu changer. Pour l'y mettre, ajoutez le poste au produit dans l'écran Postes.`,
    );
  }
}

/** L'étape a changé entre sa lecture et son écriture. */
export class LineStepChangedMeanwhileError extends BusinessError {
  constructor() {
    super(
      "production.line_step.changed_meanwhile",
      "Cette étape vient d'être modifiée par quelqu'un d'autre : rechargez la fiche, puis refaites le geste.",
    );
  }
}

/** Les postes de la ligne n'ont pas pu être lus : on ne coche pas une étape à l'aveugle. */
export class LineStationsUnreadableError extends TechnicalError {
  constructor(sku: string, cause: unknown) {
    super(
      "production.line_step.stations_unreadable",
      `Les postes de la ligne « ${sku} » n'ont pas pu être lus : l'étape n'est pas enregistrée. Réessayez dans un instant ; si cela dure, prévenez l'équipe technique.`,
      cause,
    );
  }
}
