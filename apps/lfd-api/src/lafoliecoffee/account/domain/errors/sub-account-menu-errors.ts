import {
  AuthorizationError,
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Une valeur de la carte d'un sous-compte n'est pas de celles que la carte connaît (400). */
export class UnknownMenuValueError extends DomainError {
  constructor(
    readonly field: string,
    readonly value: string,
  ) {
    super(
      "account.sub_account_menu.unknown_value",
      `La carte du site ne connaît pas la valeur « ${value} » pour « ${field} ». Rechargez l'écran de la carte et choisissez parmi les options proposées.`,
    );
  }
}

/** Une entrée de la carte ne désigne aucun article : sa référence est vide (400). */
export class EmptyMenuReferenceError extends DomainError {
  constructor() {
    super(
      "account.sub_account_menu.empty_reference",
      "Une entrée de la carte du site ne désigne aucune famille, aucun produit ni aucune déclinaison. Choisissez l'article dans l'arbre du catalogue.",
    );
  }
}

/** L'article est déjà sur la carte, inclus ou exclu (409). */
export class DuplicateMenuEntryError extends BusinessError {
  constructor(
    readonly level: string,
    readonly ref: string,
  ) {
    super(
      "account.sub_account_menu.duplicate_entry",
      `Cet article (${level} ${ref}) figure déjà sur la carte du site. Retirez l'entrée existante avant d'en poser une autre.`,
    );
  }
}

/** L'entrée à retirer n'est pas sur la carte (404). */
export class MenuEntryNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly level: string,
    readonly ref: string,
  ) {
    super(
      "account.sub_account_menu.entry_not_found",
      `Cet article (${level} ${ref}) ne figure pas sur la carte du site. Rechargez la carte : elle a peut-être déjà été modifiée.`,
    );
  }
}

/** Une carte en base n'a pas d'auteur — le CHECK `sub_account_menu_one_author` l'interdit (500). */
export class MenuWithoutAuthorError extends TechnicalError {
  constructor(readonly companyId: string) {
    super(
      "account.sub_account_menu.without_author",
      "La carte de ce site est enregistrée sans auteur, ce que la base devrait refuser. Signalez-le à l'équipe technique avec la référence de la société.",
    );
  }
}

/**
 * La personne atteint ce sous-compte, mais n'est ni propriétaire ni
 * administratrice de son compte principal : la carte d'un site se règle
 * depuis le principal, jamais depuis le site lui-même (403).
 */
export class SubAccountMenuWriterRequiredError extends AuthorizationError {
  constructor(readonly companyId: string) {
    super(
      "account.sub_account_menu.principal_admin_required",
      "La carte de ce site se règle depuis son compte principal, par son propriétaire ou un de ses administrateurs. Demandez-leur de la modifier.",
    );
  }
}

/**
 * La carte commune des sites se pose sur un compte principal ; cette société
 * est elle-même le site d'un principal, et un site n'a pas de sites (409).
 */
export class NotAPrincipalError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.principal_sites_menu.not_a_principal",
      "Ce compte est le site d'un compte principal : la carte commune des sites se règle sur le principal. Ouvrez la fiche du principal pour la régler, ou réglez la carte propre de ce site.",
    );
  }
}

/**
 * Le site doit reprendre sa carte propre, mais il n'en a jamais eu : il n'y
 * a rien à réactiver (409).
 */
export class NoOwnMenuToResumeError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.sub_account_menu.no_own_menu",
      "Ce site n'a pas de carte propre à reprendre : il suit la carte commune de son principal. Pour lui en donner une, réglez sa carte et enregistrez-la.",
    );
  }
}

/**
 * La personne atteint ce compte principal sans en être propriétaire ou
 * administratrice acceptée, ou le principal n'est pas actif : la carte
 * commune des sites ne se règle pas d'ici (403).
 */
export class SitesMenuWriterRequiredError extends AuthorizationError {
  constructor(readonly companyId: string) {
    super(
      "account.principal_sites_menu.owner_or_admin_required",
      "La carte commune des sites se règle par le propriétaire ou un administrateur du compte principal, une fois leur accès accepté et le compte actif. Demandez-leur de la modifier.",
    );
  }
}
