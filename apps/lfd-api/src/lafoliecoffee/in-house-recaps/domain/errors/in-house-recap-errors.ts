import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **récapitulatif des BL** d'un restaurant maison
 * (`comptabilite/facturation/plan-restaurants-maison.md`, D7–D9). Chaque
 * message nomme le cas réel et le geste de sortie.
 */

/** Un mois mal formé : le code s'est trompé de clé, ce n'est pas une saisie. */
export class InvalidRecapMonthError extends DomainError {
  constructor(readonly value: string) {
    super(
      "in_house_recap.month_invalid",
      `« ${value} » n'est pas un mois du récapitulatif (attendu AAAA-MM, mois 01 à 12).`,
    );
  }
}

/** Une ligne de BL à quantité négative : le BL lui-même est incohérent. */
export class InvalidRecapQuantityError extends DomainError {
  constructor(
    readonly deliveryNoteNumber: string,
    readonly sku: string,
  ) {
    super(
      "in_house_recap.quantity_invalid",
      `Le BL ${deliveryNoteNumber} porte une quantité négative ou non entière pour ${sku} : le récapitulatif n'est pas émis. Corrigez le BL, puis relancez.`,
    );
  }
}

/** Un BL hors du mois du récapitulatif : la lecture s'est trompée de fenêtre. */
export class RecapNoteOutsideMonthError extends DomainError {
  constructor(
    readonly deliveryNoteNumber: string,
    readonly month: string,
  ) {
    super(
      "in_house_recap.note_outside_month",
      `Le BL ${deliveryNoteNumber} n'a pas été remis en ${month} : il ne peut pas entrer dans ce récapitulatif.`,
    );
  }
}

/** Un même BL deux fois dans un récapitulatif. */
export class RecapNoteDuplicatedError extends DomainError {
  constructor(readonly deliveryNoteNumber: string) {
    super(
      "in_house_recap.note_duplicated",
      `Le BL ${deliveryNoteNumber} figure deux fois dans le récapitulatif : rien n'est émis.`,
    );
  }
}

/** Un récapitulatif sans BL : un mois vide s'écrit comme une issue, pas comme un document. */
export class EmptyInHouseRecapError extends BusinessError {
  constructor(
    readonly payerId: string,
    readonly month: string,
  ) {
    super(
      "in_house_recap.empty",
      `Aucun BL remis en ${month} pour ce restaurant : il n'y a rien à récapituler. Si un BL manque, vérifiez qu'il est bien marqué remis.`,
    );
  }
}

/** Réémettre un récapitulatif déjà remplacé. */
export class InHouseRecapAlreadyReplacedError extends BusinessError {
  constructor(readonly recapId: string) {
    super(
      "in_house_recap.already_replaced",
      "Ce récapitulatif a déjà été remplacé par un rectificatif : réémettez le plus récent, en tête de la liste.",
    );
  }
}

/** Le récapitulatif demandé n'existe pas. */
export class InHouseRecapNotFoundError extends ResourceNotFoundError {
  constructor(readonly recapId: string) {
    super(
      "in_house_recap.not_found",
      "Ce récapitulatif n'existe pas : rechargez la fiche du client.",
    );
  }
}

/** Le numéro d'un récapitulatif se prend dans la transaction de son émission. */
export class RecapNumberingOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "in_house_recap.numbering_outside_transaction",
      "Le numéro du récapitulatif se prend dans la transaction de l'émission : appeler ce port sous UnitOfWork.run.",
    );
  }
}
