import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../platform/shared/errors/app-error.js";

/**
 * Les refus des **destinataires du dossier du jour** (plan
 * `documentation/production/plan-envoi-du-dossier.md`, décisions 3-4, lot E2).
 *
 * Lus dans Production › Réglages par qui règle la liste : chacun nomme le cas
 * et ce qu'il faut faire.
 */

/** Une adresse qui n'en est manifestement pas une. */
export class InvalidRecipientEmailError extends DomainError {
  constructor(raw: string) {
    super(
      "production.dossier_recipient.invalid_email",
      `« ${raw} » n'est pas une adresse e-mail : vérifiez-la (une arobase, un domaine, aucun espace).`,
    );
  }
}

/** Ce qui manque à un destinataire externe. */
export type RecipientNamePart = "firstName" | "lastName";

const NAME_WORDS: Readonly<Record<RecipientNamePart, string>> = {
  firstName: "le prénom",
  lastName: "le nom",
};

/** Un externe sans prénom ou sans nom : le dossier arriverait à « personne ». */
export class RecipientNameRequiredError extends DomainError {
  constructor(part: RecipientNamePart) {
    super(
      "production.dossier_recipient.name_required",
      `Il manque ${NAME_WORDS[part]} du destinataire : saisissez son prénom et son nom, pour qu'on sache à qui part le dossier.`,
    );
  }
}

/** Une adresse — ou une fiche — déjà dans la liste. */
export class DuplicateDossierRecipientError extends BusinessError {
  constructor(email: string, holder: string) {
    super(
      "production.dossier_recipient.duplicate",
      `L'adresse ${email} reçoit déjà le dossier du jour (${holder}) : un même e-mail n'est inscrit qu'une fois. Retirez d'abord l'autre ligne si vous voulez la remplacer.`,
    );
  }
}

/** La fiche choisie n'existe pas dans l'annuaire. */
export class UnknownStaffRecipientError extends ResourceNotFoundError {
  constructor(staffUserId: string) {
    super(
      "production.dossier_recipient.unknown_staff",
      `La fiche du personnel « ${staffUserId} » n'existe pas dans l'annuaire : rechargez la liste du personnel et choisissez à nouveau.`,
    );
  }
}

/** La fiche choisie est suspendue : elle ne recevrait rien. */
export class SuspendedStaffRecipientError extends BusinessError {
  constructor(name: string) {
    super(
      "production.dossier_recipient.suspended_staff",
      `${name} est suspendu·e dans l'annuaire : réactivez sa fiche dans Équipe avant de l'ajouter aux destinataires.`,
    );
  }
}

/** Le destinataire à retirer n'est pas (ou plus) dans la liste. */
export class DossierRecipientNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "production.dossier_recipient.not_found",
      `Le destinataire « ${id} » n'est pas dans la liste du dossier du jour — il a peut-être déjà été retiré. Rechargez la page.`,
    );
  }
}

/** Une ligne que la contrainte de la table aurait dû refuser. */
export class CorruptDossierRecipientError extends TechnicalError {
  constructor(id: string, reason: string) {
    super(
      "production.dossier_recipient.corrupt",
      `Le destinataire du dossier « ${id} » est illisible (${reason}) : la contrainte de la table a été contournée.`,
    );
  }
}
