import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un modèle d'e-mail qui ne se règle pas par destinataires (400). */
export class UnknownStaffNoticeError extends DomainError {
  constructor(template: string) {
    super(
      "STAFF_NOTICE_UNKNOWN",
      `L'avis « ${template} » ne se règle pas par destinataires : seuls les avis listés ` +
        "dans Admin › Destinataires des avis le peuvent. Rechargez la page.",
    );
  }
}

/** Un rôle visé qui n'existe pas (400) — la ligne est invalide. */
export class UnknownNoticeRoleError extends DomainError {
  constructor(roleKey: string) {
    super(
      "STAFF_NOTICE_ROLE_UNKNOWN",
      `Le rôle « ${roleKey} » n'existe pas : il ne peut pas recevoir un avis. ` +
        "Rechargez la page et choisissez un rôle de la liste.",
    );
  }
}

/**
 * Un rôle archivé qu'on AJOUTE (409). Déjà réglé, il reste : c'est la clé
 * étrangère qui empêche de supprimer un rôle visé, pas de l'archiver.
 */
export class ArchivedNoticeRoleError extends BusinessError {
  constructor(label: string) {
    super(
      "STAFF_NOTICE_ROLE_ARCHIVED",
      `Le rôle « ${label} » est archivé : il ne peut pas être ajouté aux destinataires. ` +
        "Restaurez-le dans Admin › Rôles, ou choisissez-en un autre.",
    );
  }
}

/** Un membre visé qui n'existe pas (400) — la ligne est invalide. */
export class UnknownNoticeMemberError extends DomainError {
  constructor(staffUserId: string) {
    super(
      "STAFF_NOTICE_MEMBER_UNKNOWN",
      `Aucune fiche de l'équipe ne porte l'identifiant « ${staffUserId} » : elle ne peut pas ` +
        "recevoir un avis. Rechargez la page et choisissez un membre de la liste.",
    );
  }
}
