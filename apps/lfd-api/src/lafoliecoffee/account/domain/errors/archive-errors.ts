import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Le motif d'une suppression de compte est mal formé (400) : vide, ou trop long. */
export class InvalidArchiveReasonError extends DomainError {
  constructor(reason: string) {
    super("account.archive.invalid_reason", `Motif de la suppression du compte : ${reason}`);
  }
}

/**
 * Le compte a des commandes (409) : il a servi, il ne disparaît pas des listes.
 * Le geste de sortie est la résiliation, qui le garde visible.
 */
export class CompanyHasOrdersError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.archive.has_orders",
      "Ce compte a des commandes : il ne peut pas être supprimé. Résiliez-le.",
    );
  }
}

/** Le compte est un site rattaché à un principal (409) : il se détache d'abord. */
export class SiteCannotBeArchivedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.archive.is_site",
      "Ce compte est un site rattaché à une fiche principale : il ne peut pas être supprimé tel quel. Détachez-le de sa fiche principale, puis supprimez-le.",
    );
  }
}

/** Le compte est déjà supprimé (409) : on n'écrase pas le motif ni l'auteur du premier geste. */
export class CompanyAlreadyArchivedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.archive.already_archived",
      "Ce compte est déjà supprimé. Rendez-le d'abord si vous voulez changer le motif.",
    );
  }
}

/** Le compte n'est pas supprimé (409) : il n'y a rien à rendre. */
export class CompanyNotArchivedError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.archive.not_archived",
      "Ce compte n'est pas supprimé : il est déjà dans la liste des clients, il n'y a rien à rendre.",
    );
  }
}
