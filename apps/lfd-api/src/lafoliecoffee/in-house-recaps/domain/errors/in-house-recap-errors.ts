import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **récapitulatif des BL** d'un restaurant maison
 * (`comptabilite/facturation/restaurants-maison.md`). Chaque
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

/** Un second PDF pour un récapitulatif déjà rangé : le document parti est le seul gardé. */
export class InHouseRecapDocumentAlreadyKeptError extends BusinessError {
  constructor(readonly recapNumber: string) {
    super(
      "in_house_recap.document_already_kept",
      `Le PDF du récapitulatif ${recapNumber} est déjà rangé : il ne se remplace pas. Pour corriger le document, réémettez le récapitulatif.`,
    );
  }
}

/** Le PDF n'est pas encore rangé : l'émission n'a pas pu le produire. */
export class InHouseRecapDocumentNotKeptError extends ResourceNotFoundError {
  constructor(readonly recapNumber: string) {
    super(
      "in_house_recap.document_not_kept",
      `Le PDF du récapitulatif ${recapNumber} n'est pas encore rangé : « Renvoyer l'e-mail » le produit et l'envoie.`,
    );
  }
}

/** Le payeur n'a personne à qui envoyer le récapitulatif. */
export class InHouseRecapNobodyToNotifyError extends BusinessError {
  constructor(readonly recapNumber: string) {
    super(
      "in_house_recap.nobody_to_notify",
      `Le récapitulatif ${recapNumber} n'a pas de destinataire : ce restaurant n'a ni contact de facturation ni détenteur avec une adresse e-mail. Ajoutez un contact de facturation sur la fiche client, puis renvoyez l'e-mail.`,
    );
  }
}

/** Renvoyer un récapitulatif remplacé : c'est le rectificatif qui fait foi. */
export class ReplacedInHouseRecapNotSentError extends BusinessError {
  constructor(readonly recapNumber: string) {
    super(
      "in_house_recap.replaced_not_sent",
      `Le récapitulatif ${recapNumber} a été remplacé par un rectificatif : renvoyez le plus récent, en tête de la liste.`,
    );
  }
}

/** Le payeur d'un récapitulatif a disparu de l'annuaire : la clé étrangère l'interdit. */
export class RecapPayerMissingError extends TechnicalError {
  constructor(readonly recapNumber: string) {
    super(
      "in_house_recap.payer_missing",
      `Le payeur du récapitulatif ${recapNumber} est introuvable : le PDF n'est pas produit. Signalez-le à l'équipe technique.`,
    );
  }
}
