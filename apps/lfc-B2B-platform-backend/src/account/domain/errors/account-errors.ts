import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../shared/errors/app-error.js";

// ─── Données mal formées : le modèle se protège lui-même (400) ───────────────

export class InvalidPersonNameError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("account.person_name.invalid", `${field} : ${reason}`);
  }
}

export class InvalidEmailError extends DomainError {
  constructor(readonly raw: string) {
    super("account.email.invalid", `« ${raw} » n'est pas une adresse e-mail valide.`);
  }
}

export class InvalidPhoneError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("account.phone.invalid", `Téléphone « ${raw} » : ${reason}`);
  }
}

export class InvalidSiretError extends DomainError {
  constructor(
    readonly raw: string,
    readonly reason: string,
  ) {
    super("account.siret.invalid", `SIRET « ${raw} » : ${reason}`);
  }
}

export class InvalidCompanyIdentityError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("account.company.invalid", `${field} : ${reason}`);
  }
}

// ─── Refus métier : la demande est bien formée mais impossible ici (409) ─────

/**
 * Deux sociétés du même SIRET ne peuvent pas coexister : le SIRET **est**
 * l'identité légale d'un établissement, un doublon signifie soit une faute de
 * saisie, soit deux personnes déclarant le même établissement (à arbitrer côté
 * commercial, cf. la déduplication SIRET du doc d'onboarding).
 */
export class SiretAlreadyRegisteredError extends BusinessError {
  constructor(readonly siret: string) {
    super(
      "account.company.siret_already_registered",
      "Une entreprise portant ce SIRET est déjà enregistrée.",
    );
  }
}

/** L'adresse e-mail visée appartient déjà à un autre compte. */
export class EmailAlreadyUsedError extends BusinessError {
  constructor(readonly email: string) {
    super("account.email.already_used", "Cette adresse e-mail est déjà utilisée par un compte.");
  }
}

// ─── Introuvable (404) ───────────────────────────────────────────────────────

export class UserProfileNotFoundError extends ResourceNotFoundError {
  constructor(readonly userId: string) {
    super("account.profile.not_found", "Profil introuvable.");
  }
}

// ─── Panne technique (500) ───────────────────────────────────────────────────

/**
 * La propagation de l'e-mail vers Auth0 a échoué (ou n'est pas configurée).
 *
 * C'est **volontairement** une erreur technique et non un refus métier : le
 * client n'a rien fait de mal, et on refuse d'écrire l'e-mail chez nous s'il ne
 * peut pas l'être chez le fournisseur d'identité — sinon on connecterait
 * l'utilisateur avec une adresse et on lui en afficherait une autre.
 */
export class IdentityProviderUnavailableError extends TechnicalError {
  constructor(reason: string, cause?: unknown) {
    super("account.identity_provider.unavailable", reason, cause);
  }
}
