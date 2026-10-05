import type { CompanyFollowAspect } from "@lfd/contracts";

import {
  AuthorizationError,
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **hiérarchie des comptes** (plan `plan-sous-comptes.md`,
 * lot S1). Chaque message nomme le cas réel et le geste de sortie : il est lu
 * par un commercial qui n'a pas le code sous les yeux.
 */

const ASPECT_WORDS: Readonly<Record<CompanyFollowAspect, string>> = {
  billing: "la facturation",
  pricing: "le tarif",
  contacts: "les contacts",
};

/** Un compte ne peut pas être son propre principal. */
export class CompanyCannotParentItselfError extends DomainError {
  constructor(readonly companyId: string) {
    super(
      "account.hierarchy.self_parent",
      "Un compte ne peut pas être son propre compte principal : choisissez un autre compte.",
    );
  }
}

/** Le principal visé est lui-même un sous-compte : la profondeur est de 1 (§5, R10). */
export class ParentIsSubAccountError extends BusinessError {
  constructor(readonly parentId: string) {
    super(
      "account.hierarchy.parent_is_sub_account",
      "Ce compte est déjà le sous-compte d'un autre : un sous-compte n'a pas de sous-compte. Rattachez plutôt au compte principal du groupe.",
    );
  }
}

/** Le compte à rattacher a lui-même des sous-comptes. */
export class CompanyHasSubAccountsError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.hierarchy.has_sub_accounts",
      "Ce compte a lui-même des sous-comptes : il ne peut pas devenir sous-compte. Détachez d'abord ses sous-comptes.",
    );
  }
}

/** Déjà rattaché à un autre principal : on détache avant de rattacher ailleurs. */
export class AlreadySubAccountError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.hierarchy.already_sub_account",
      "Ce compte est déjà le sous-compte d'un autre compte principal : détachez-le d'abord.",
    );
  }
}

/** Le geste suppose un sous-compte, et ce compte n'a pas de principal. */
export class NotASubAccountError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.hierarchy.not_a_sub_account",
      "Ce compte n'est le sous-compte d'aucun compte principal : rattachez-le d'abord.",
    );
  }
}

/** Un compte de groupe sans livraison est un principal, jamais un sous-compte (§4). */
export class GroupAccountCannotBeSubAccountError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.hierarchy.group_account_is_principal",
      "Un compte de groupe, sans livraison, est un compte principal : décochez la case avant de le rattacher.",
    );
  }
}

/** Suivre la facturation exige un principal actif (§2.4). */
export class BillingFollowNeedsActiveParentError extends BusinessError {
  constructor(readonly parentId: string) {
    super(
      "account.hierarchy.billing_needs_active_parent",
      "Le compte principal n'est pas actif : un sous-compte ne peut pas être facturé à son nom. Activez d'abord le compte principal.",
    );
  }
}

/** Le suivi du tarif est une décision du commercial (Q9). */
export class PricingFollowNotAllowedError extends AuthorizationError {
  constructor(readonly aspect: CompanyFollowAspect = "pricing") {
    super(
      "account.hierarchy.pricing_follow_forbidden",
      `Suivre ${ASPECT_WORDS[aspect]} du compte principal est une décision de tarification : il faut le droit « Tarification » en écriture.`,
    );
  }
}

/** Une période ne se ferme pas avant d'avoir commencé. */
export class FollowPeriodWindowError extends DomainError {
  constructor(readonly aspect: CompanyFollowAspect) {
    super(
      "account.hierarchy.follow_window",
      `Le suivi de ${ASPECT_WORDS[aspect]} ne peut pas cesser avant d'avoir commencé.`,
    );
  }
}

/**
 * Un principal sans identifiant : une société pas encore enregistrée ne peut
 * pas en avoir sous elle. Faute de câblage, pas cas métier.
 */
export class UnsavedParentCompanyError extends TechnicalError {
  constructor() {
    super(
      "account.hierarchy.unsaved_parent",
      "Le compte principal doit être enregistré avant qu'on lui rattache un sous-compte.",
    );
  }
}
