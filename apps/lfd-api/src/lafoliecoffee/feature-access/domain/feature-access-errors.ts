import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../platform/shared/errors/app-error.js";

/** La clé demandée n'est pas au catalogue du code (**404**). */
export class UnknownFeatureError extends ResourceNotFoundError {
  constructor(readonly key: string) {
    super(
      "feature_access.unknown_feature",
      `« ${key} » n'est pas une fonctionnalité réglable. Rechargez la page : la liste affichée est celle du catalogue en service.`,
    );
  }
}

/** La valeur proposée n'est pas un niveau de cette clé (**400**). */
export class UnknownFeatureLevelError extends DomainError {
  constructor(
    readonly key: string,
    readonly value: string,
    readonly allowed: readonly string[],
  ) {
    super(
      "feature_access.unknown_level",
      `« ${value} » n'est pas un niveau possible pour « ${key} ». Niveaux acceptés : ${allowed.join(", ")}.`,
    );
  }
}

/** Aucune dérogation à retirer : la clé est déjà sur le défaut du code (**404**). */
export class FeatureOverrideNotFoundError extends ResourceNotFoundError {
  constructor(readonly key: string) {
    super(
      "feature_access.override_not_found",
      `« ${key} » est déjà sur sa valeur par défaut : il n'y a aucune dérogation à retirer.`,
    );
  }
}

/** L'exemption visée n'existe pas, ou pas sous cette clé (**404**). */
export class FeatureExemptionNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly key: string,
    readonly id: string,
  ) {
    super(
      "feature_access.exemption_not_found",
      `Cette adresse n'est plus dans la liste d'exemption de « ${key} » : elle a sans doute déjà été retirée. Rechargez la page.`,
    );
  }
}

/**
 * On a voulu exempter une adresse sur une clé qu'aucune exemption n'ouvre
 * (**409**).
 *
 * Refus métier et non 400 : la clé et l'adresse sont bien formées, c'est le
 * geste qui n'a pas de sens pour cette clé. Le message dit le geste de sortie —
 * ouvrir la clé pour tous, ou pas du tout.
 */
export class FeatureNotExemptibleError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "feature_access.not_exemptible",
      `« ${key} » ne s'ouvre pas adresse par adresse : ce qu'elle ouvre engage un vrai compte. Réglez son niveau pour tous, ou laissez-la fermée.`,
    );
  }
}

/**
 * On a voulu exempter une adresse sur une clé qui s'ouvre société par
 * société (**409**). Le message dit le geste de sortie : exempter la société.
 */
export class FeatureExemptedByCompanyError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "feature_access.exempted_by_company",
      `« ${key} » s'ouvre société par société, pas adresse par adresse : choisissez la société dans la liste des sociétés exemptées.`,
    );
  }
}

/**
 * On a voulu exempter une société sur une clé qui ne s'ouvre pas société par
 * société (**409**).
 */
export class FeatureNotExemptibleByCompanyError extends BusinessError {
  constructor(readonly key: string) {
    super(
      "feature_access.not_exemptible_by_company",
      `« ${key} » ne s'ouvre pas société par société. Réglez son niveau pour tous, ou laissez-la fermée.`,
    );
  }
}

/** La société à exempter n'existe pas (**404**). */
export class ExemptedCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "feature_access.company_not_found",
      "Cette société n'existe pas : elle ne peut pas être exemptée. Rechargez la page et choisissez-la dans la liste.",
    );
  }
}

/** La société à exempter est archivée (« Supprimer le compte ») — **409**. */
export class ArchivedCompanyExemptionError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly companyName: string,
  ) {
    super(
      "feature_access.company_archived",
      `Le compte de « ${companyName} » a été supprimé : il ne peut pas être exempté. Choisissez une société active.`,
    );
  }
}

/** La société est déjà exemptée pour cette clé (**409**). */
export class CompanyAlreadyExemptedError extends BusinessError {
  constructor(
    readonly key: string,
    readonly companyName: string,
  ) {
    super(
      "feature_access.company_already_exempted",
      `« ${companyName} » est déjà exemptée pour « ${key} » : rien à ajouter. Rechargez la page pour voir la liste à jour.`,
    );
  }
}

/** La société visée n'est pas (ou plus) dans la liste d'exemption de cette clé (**404**). */
export class FeatureCompanyExemptionNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly key: string,
    readonly companyId: string,
  ) {
    super(
      "feature_access.company_exemption_not_found",
      `Cette société n'est plus dans la liste d'exemption de « ${key} » : elle a sans doute déjà été retirée. Rechargez la page.`,
    );
  }
}
