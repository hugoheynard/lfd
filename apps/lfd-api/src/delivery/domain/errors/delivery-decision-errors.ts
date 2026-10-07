import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus de **la décision du commercial** (`documentation/livraisons/livreur/a-la-porte.md`,
 * § 10 B3, § 10 bis) — et celui que le livreur reçoit quand on a décidé de
 * rapporter. Le commercial décide depuis le bureau, sans voir la tournée : le
 * geste de sortie est de recharger la liste, ou de passer par « Non remis ».
 */

/** Aucun signalement n'a ouvert de décision sur cet arrêt. */
export class StopDecisionNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "delivery.stop_decision_not_found",
      "Aucune décision n'est ouverte sur cet arrêt : seul un signalement « à la remise » du livreur en ouvre une. Rechargez la liste « À décider ».",
    );
  }
}

/** L'arrêt est déjà clos — remis, déposé, ou rapporté : il n'y a plus rien à décider. */
export class StopDecisionOnClosedStopError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.stop_decision_stop_closed",
      `L'arrêt de la commande ${reference} est déjà clos (remis, déposé ou rapporté) : il n'y a plus rien à décider. Rechargez la liste « À décider ».`,
    );
  }
}

/** La tournée est rentrée : une décision n'atteindrait plus le livreur. */
export class StopDecisionOnReturnedRoundError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.stop_decision_round_returned",
      `La tournée de la commande ${reference} est rentrée : la décision ne peut plus atteindre le livreur. La commande est dans « Non remis » ; réglez-la hors application.`,
    );
  }
}

/** La décision a changé entre la lecture et l'écriture (une autre réponse est passée). */
export class StopDecisionStaleError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.stop_decision_stale",
      `La décision sur la commande ${reference} a changé pendant votre geste : rechargez la liste « À décider » et décidez de nouveau.`,
    );
  }
}

/**
 * Le livreur rejoue un geste sur un arrêt qu'un commercial a fait RAPPORTER
 * (LB-Q2) : rien n'a été remis ici, et la marchandise doit rentrer.
 */
export class StopBroughtBackError extends BusinessError {
  constructor(reference: string) {
    super(
      "delivery.stop_brought_back",
      `Un commercial a décidé de rapporter la commande ${reference} : ne la laissez pas. Gardez-la dans le véhicule et rapportez-la au dépôt.`,
    );
  }
}
