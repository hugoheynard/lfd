import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la carte des postes — lus au Prod manager, par la personne qui
 * règle le fournil, sans le code sous les yeux : chacun nomme le poste et ce
 * qu'il faut faire pour en sortir.
 */

/** Un nom vide, ou trop long pour un onglet de fiche. */
export class InvalidWorkstationNameError extends DomainError {
  constructor(reason: string) {
    super("production.workstation.invalid_name", `Le nom du poste ${reason}.`);
  }
}

/** Une référence de produit vide ou trop longue. */
export class InvalidProductSkuError extends DomainError {
  constructor() {
    super(
      "production.workstation.invalid_product",
      "La référence du produit est vide ou trop longue : rechargez la page Postes.",
    );
  }
}

/** Deux postes vivants portent le même nom. */
export class WorkstationNameTakenError extends BusinessError {
  constructor(name: string) {
    super(
      "production.workstation.name_taken",
      `Un poste s'appelle déjà « ${name} ». Choisissez un autre nom, ou renommez d'abord l'autre poste.`,
    );
  }
}

/** Le poste visé n'existe pas, ou plus. */
export class WorkstationNotFoundError extends ResourceNotFoundError {
  constructor() {
    super(
      "production.workstation.not_found",
      "Ce poste n'existe pas, ou plus : rechargez la page Postes.",
    );
  }
}

/** On n'archive pas un poste qui porte encore des produits. */
export class WorkstationStillUsedError extends BusinessError {
  constructor(name: string, productCount: number) {
    super(
      "production.workstation.still_used",
      `Le poste « ${name} » porte encore ${String(productCount)} produit(s). ` +
        "Placez-les à un autre poste, ou remettez-les « à ranger », puis archivez-le.",
    );
  }
}

/** On ne place rien sur un poste archivé. */
export class WorkstationArchivedError extends BusinessError {
  constructor(name: string) {
    super(
      "production.workstation.archived",
      `Le poste « ${name} » est archivé : on n'y place plus de produit. Choisissez un poste en service.`,
    );
  }
}

/** Un nouvel ordre qui ne nomme pas exactement les postes en service. */
export class WorkstationOrderMismatchError extends BusinessError {
  constructor() {
    super(
      "production.workstation.order_mismatch",
      "L'ordre envoyé ne correspond plus aux postes en service : rechargez la page Postes et recommencez.",
    );
  }
}
