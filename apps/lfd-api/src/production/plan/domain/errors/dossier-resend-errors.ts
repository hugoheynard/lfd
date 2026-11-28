import {
  BusinessError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **renvoi du dossier mis à jour**
 * (`documentation/fournil/les-versions-du-plan.md`). Lus par
 * le Prod manager dans le dossier du jour : chacun nomme le cas et le geste
 * de sortie.
 */

/** La journée n'a pas de version du plan : rien à renvoyer. */
export class NoPlanVersionToResendError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "production.dossier_resend.no_plan_version",
      `Le plan du ${serviceDay} n'a aucune version : il n'a pas été arrêté depuis qu'on garde les versions. Arrêtez le plan ; le dossier partira alors à toute la liste.`,
    );
  }
}

/** Le destinataire visé n'est plus dans la liste du dossier. */
export class DossierResendRecipientUnknownError extends ResourceNotFoundError {
  constructor(recipientId: string) {
    super(
      "production.dossier_resend.unknown_recipient",
      `Le destinataire ${recipientId} ne reçoit plus le dossier (retiré de la liste, fiche suspendue ou sans adresse) : rechargez la liste des destinataires.`,
    );
  }
}

/** Le destinataire visé a déjà la version courante. */
export class DossierRecipientUpToDateError extends BusinessError {
  constructor(name: string, version: number) {
    super(
      "production.dossier_resend.up_to_date",
      `${name} a déjà reçu la version ${version}, la version courante du plan : il n'y a rien à lui renvoyer.`,
    );
  }
}

/**
 * Le papier de la version courante ne peut pas être rangé : l'e-mail joint
 * l'exemplaire rangé, jamais un papier qu'on ne pourrait pas relire.
 */
export class DossierPaperNotStoredError extends BusinessError {
  constructor(serviceDay: string, version: number) {
    super(
      "production.dossier_resend.paper_not_stored",
      `Le dossier de la version ${version} du plan du ${serviceDay} n'a pas pu être rangé (bons de livraison, rayons ou fiches de fonction illisibles pour l'instant, ou stockage indisponible) : rien n'est parti. Réessayez dans un instant.`,
    );
  }
}

/** Le noyau n'a pas rendu le résumé demandé : une incohérence, pas un cas métier. */
export class PlanVersionSummaryMissingError extends TechnicalError {
  constructor(serviceDay: string, since: number) {
    super(
      "production.dossier_resend.summary_missing",
      `Le résumé du plan du ${serviceDay} depuis la version ${since} manque : rien n'est parti. Signalez-le à l'équipe technique.`,
    );
  }
}

/** La version demandée n'existe pas pour cette journée. */
export class PlanVersionPaperUnknownVersionError extends ResourceNotFoundError {
  constructor(serviceDay: string, version: number) {
    super(
      "production.plan_version_paper.unknown_version",
      `Le plan du ${serviceDay} n'a pas de version ${version} : rechargez la liste des versions et choisissez-en une qu'elle affiche.`,
    );
  }
}

/**
 * Le papier de la version n'est pas rangé : un papier ancien ne se refabrique
 * jamais (il dirait l'état d'aujourd'hui sous le nom d'hier).
 */
export class PlanVersionPaperNotArchivedError extends ResourceNotFoundError {
  constructor(serviceDay: string, version: number) {
    super(
      "production.plan_version_paper.not_archived",
      `Le papier de la version ${version} du plan du ${serviceDay} n'a pas été rangé : il ne peut pas être refait après coup. Seul le papier de la version courante se tire du dossier du jour.`,
    );
  }
}
