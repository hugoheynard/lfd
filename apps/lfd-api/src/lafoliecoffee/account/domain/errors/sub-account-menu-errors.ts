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
