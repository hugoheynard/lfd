import { DomainError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

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
