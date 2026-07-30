import {
  AuthorizationError,
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

/**
 * L'entreprise visée n'est pas accessible au demandeur.
 *
 * Volontairement un **404** et non un 403 : quand le demandeur n'est rattaché à
 * aucune membership de cette entreprise, on ne divulgue même pas qu'elle existe.
 * Un client normal ne vise que ses propres entreprises (celles de son `/me`) ;
 * ce cas n'arrive que sur un id forgé.
 */
export class CompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super("account.company.not_found", "Entreprise introuvable.");
  }
}

/** Le contact visé n'appartient pas à cette entreprise (ou n'existe plus). */
export class CompanyContactNotFoundError extends ResourceNotFoundError {
  constructor(readonly contactId: string) {
    super("account.contact.not_found", "Contact introuvable.");
  }
}

/** Aucun KBIS n'a encore été déposé pour cette entreprise. */
export class KbisNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super("account.kbis.not_found", "Aucun KBIS n'a été déposé pour cette entreprise.");
  }
}

/** Le fichier déposé n'est pas un KBIS acceptable (format, taille). */
export class InvalidKbisFileError extends DomainError {
  constructor(reason: string) {
    super("account.kbis.invalid_file", `KBIS refusé : ${reason}`);
  }
}

/** L'adresse visée n'appartient pas à cette entreprise (ou est archivée). */
export class CompanyAddressNotFoundError extends ResourceNotFoundError {
  constructor(readonly addressId: string) {
    super("account.address.not_found", "Adresse introuvable.");
  }
}

// ─── Rôle insuffisant : authentifié, mais pas le droit (403) ─────────────────

/**
 * Le demandeur est bien membre de l'entreprise, mais n'en est pas le
 * gestionnaire. Gérer les contacts est réservé au `company_admin` — révéler que
 * l'entreprise existe est ici acceptable (il en est membre), d'où le 403 plutôt
 * qu'un 404.
 */
export class CompanyAdminRequiredError extends AuthorizationError {
  constructor(readonly companyId: string) {
    super(
      "account.company.admin_required",
      "Seul le gestionnaire de l'entreprise peut effectuer cette action.",
    );
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

/**
 * Le stockage objet (R2) n'est pas configuré, ou a échoué.
 *
 * Technique et non métier : le client n'a rien fait de mal. Sans bucket
 * configuré (`STORAGE_*` absents), dépôt et téléchargement du KBIS sont
 * indisponibles ; le reste de l'app fonctionne.
 */
export class KbisStorageUnavailableError extends TechnicalError {
  constructor(reason: string, cause?: unknown) {
    super("account.kbis.storage_unavailable", reason, cause);
  }
}
