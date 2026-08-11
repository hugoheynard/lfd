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

/**
 * Une demande de support est déjà **ouverte** (non traitée) pour cette
 * entreprise. Une seule à la fois : inutile d'empiler des rappels, et ça borne
 * naturellement l'écriture (un membre ne peut pas inonder la table).
 */
export class OpenSupportRequestExistsError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.support.request_already_open",
      "Une demande de support est déjà en cours pour cette entreprise ; notre équipe va vous recontacter.",
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

/**
 * L'activation est refusée : des **pièces requises** manquent, ou la société n'est
 * pas dans l'état `pending`. Refus **métier** (409) — la demande est bien formée,
 * mais l'état courant l'interdit. `missing` liste les pièces à compléter (vide si
 * le refus tient au statut).
 */
/**
 * Transition d'état refusée : suspendre un compte jamais activé, réactiver un
 * compte qui ne l'est pas, résilier deux fois. On dit **d'où** on venait — sans
 * ça, le message ne permet pas de comprendre ce qu'il fallait faire.
 */
export class CompanyStatusTransitionError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly from: string,
    message: string,
  ) {
    super("account.company.status_transition", message);
  }
}

export class CompanyActivationBlockedError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly missing: readonly string[],
    message: string,
  ) {
    super("account.company.activation_blocked", message);
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
 * gestionnaire. Gérer les contacts est réservé au détenteur et aux `admin` —
 * révéler que
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

/**
 * On a demandé un accès pour une personne **désactivée**.
 *
 * `disabled` est une décision prise sur quelqu'un ; ouvrir un accès ne doit pas
 * la renverser au passage, discrètement, parce qu'un commercial a cliqué sur un
 * bouton d'invitation. Réactiver quelqu'un est un geste à part, qui n'existe pas
 * encore — le refus le dit plutôt que de faire semblant.
 */
export class AccountDisabledError extends BusinessError {
  constructor(readonly email: string) {
    super(
      "account.access.account_disabled",
      "Ce compte est désactivé : son accès ne peut pas être rouvert ici.",
    );
  }
}

/**
 * La société a déjà un **détenteur**, et ce n'est pas la personne visée.
 *
 * Le rôle `owner` se constate — c'est celui dont l'adresse a ouvert le compte —
 * donc il ne s'ajoute pas. Un second détenteur ferait deux personnes également
 * légitimes à parler au nom de la société, sans qu'aucune règle ne dise laquelle
 * prime. Transférer la détention est un autre geste, qui n'existe pas encore.
 */
export class CompanyAlreadyHasOwnerError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.company.already_has_owner",
      "Cette société a déjà un détenteur : un second ne peut pas être ajouté.",
    );
  }
}

/**
 * Cette adresse est **déjà** interlocutrice de la société.
 *
 * Une personne, une adresse, un rôle : deux lignes pour la même boîte e-mail
 * donneraient deux rôles à la même personne, et l'accès ouvert depuis l'une
 * contredirait celui affiché sur l'autre.
 */
export class ContactAlreadyExistsError extends BusinessError {
  constructor(readonly email: string) {
    super(
      "account.company.contact_already_exists",
      "Cette adresse est déjà celle d'un interlocuteur de cette société.",
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
