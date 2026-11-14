import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * On confie le suivi d'un **site** (409). Un site est de la structure, pas une
 * acquisition : c'est son principal qui se suit.
 */
export class SiteHasNoFollowerError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly parentCompanyId: string,
  ) {
    super(
      "account.follower.site_has_no_follower",
      "Cette fiche est un site : un site n'a pas de commercial attitré. Confiez le suivi à la fiche principale dont il dépend.",
    );
  }
}

/** Le suiveur demandé n'a pas d'identifiant (400). */
export class InvalidFollowerError extends DomainError {
  constructor() {
    super(
      "account.follower.invalid",
      "Aucune personne de l'équipe n'est désignée. Choisissez un commercial dans la liste, ou retirez le suiveur.",
    );
  }
}

/** Le suiveur demandé n'est pas dans l'annuaire de l'équipe (404). */
export class FollowerNotFoundError extends ResourceNotFoundError {
  constructor(readonly staffUserId: string) {
    super(
      "account.follower.not_found",
      "Cette personne n'est pas dans l'annuaire de l'équipe. Rechargez la page et choisissez un commercial dans la liste.",
    );
  }
}

/** Le suiveur demandé a une fiche suspendue (409) : il ne peut plus suivre personne. */
export class FollowerSuspendedError extends BusinessError {
  constructor(readonly staffUserId: string) {
    super(
      "account.follower.suspended",
      "Cette personne a un accès suspendu : elle ne peut pas suivre une fiche. Choisissez un commercial actif, ou rétablissez d'abord son accès.",
    );
  }
}
