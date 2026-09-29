import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **bacs** (lot 4 bis, tranche A) — lus au labo par qui n'a pas
 * le code sous les yeux : chacun nomme le cas réel et le geste de sortie.
 */

/** Le nom d'un type de bac est vide ou trop long. */
export class InvalidBinTypeNameError extends DomainError {
  constructor(maxLength: number) {
    super(
      "delivery.bin_type_name_invalid",
      `Le nom du type de bac est requis, et tient en ${maxLength} caractères au plus.`,
    );
  }
}

/** Une dimension hors bornes ou non entière. */
export class InvalidBinDimensionsError extends DomainError {
  constructor(side: string, detail: string, min: number, max: number) {
    super(
      "delivery.bin_dimensions_invalid",
      `Dimensions ${side} du bac : ${detail}. Chaque dimension est un nombre entier de centimètres, de ${min} à ${max}.`,
    );
  }
}

/** L'intérieur dépasse l'extérieur dans une dimension. */
export class BinInnerExceedsOuterError extends DomainError {
  constructor(dimension: string, inner: number, outer: number) {
    super(
      "delivery.bin_inner_exceeds_outer",
      `${dimension} intérieure (${inner} cm) dépasse ${dimension.toLowerCase()} extérieure (${outer} cm) : corrigez l'une des deux — l'intérieur tient dans l'extérieur.`,
    );
  }
}

/** La hauteur de pile est hors bornes. */
export class InvalidBinMaxStackError extends DomainError {
  constructor(value: number, min: number, max: number) {
    super(
      "delivery.bin_max_stack_invalid",
      `Une pile de ${value} bacs n'est pas admise : saisissez un nombre entier de ${min} à ${max}.`,
    );
  }
}

/** Une contenance hors bornes. */
export class InvalidBinCapacityError extends DomainError {
  constructor(value: number, min: number, max: number) {
    super(
      "delivery.bin_capacity_invalid",
      `Une contenance de ${value} unités n'est pas admise : saisissez un nombre entier de ${min} à ${max}, ou videz la case pour la retirer.`,
    );
  }
}

/** Un autre type de bac non archivé porte déjà ce nom. */
export class BinTypeNameTakenError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.bin_type_name_taken",
      `Un type de bac s'appelle déjà « ${name} » : choisissez un autre nom, ou archivez l'ancien d'abord.`,
    );
  }
}

/** Aucun type de bac sous cet identifiant. */
export class BinTypeNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "delivery.bin_type_not_found",
      `Aucun type de bac sous l'identifiant ${id} : rechargez le catalogue des bacs.`,
    );
  }
}

/** Archiver un type qui l'est déjà. */
export class BinTypeAlreadyArchivedError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.bin_type_already_archived",
      `Le type de bac « ${name} » est déjà archivé : réactivez-le s'il revient en service.`,
    );
  }
}

/** Réactiver un type qui n'est pas archivé. */
export class BinTypeNotArchivedError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.bin_type_not_archived",
      `Le type de bac « ${name} » est déjà en service : il n'y a rien à réactiver.`,
    );
  }
}

/** Poser une contenance sur un type archivé. */
export class BinTypeArchivedForCapacityError extends BusinessError {
  constructor(name: string) {
    super(
      "delivery.bin_type_archived_for_capacity",
      `Le type de bac « ${name} » est archivé : réactivez-le avant de renseigner ses contenances.`,
    );
  }
}
