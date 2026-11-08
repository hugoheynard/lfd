import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/** Une préférence mal formée : l'appelant l'a construite de travers. */
export class InvalidMarketingPreferenceError extends DomainError {
  constructor(field: string, reason: string) {
    super(
      "MAIL_MARKETING_PREFERENCE_INVALID",
      `La préférence marketing est refusée : ${field} ${reason}. ` +
        "Corriger l'appel ; rien n'a été rangé.",
    );
  }
}

/**
 * Une désinscription ne se lève que par un geste volontaire, connecté, sur
 * « Mes préférences » (plan de désinscription, décisions de Hugo) — jamais
 * par une case de commande, d'inscription ou de pied de page.
 */
export class MarketingResubscriptionRefusedError extends BusinessError {
  constructor(space: string, place: string) {
    super(
      "MAIL_MARKETING_RESUBSCRIPTION_REFUSED",
      `Cette adresse s'est désinscrite des e-mails de l'espace « ${space} » : un accord ` +
        `recueilli par « ${place} » ne la réinscrit pas. Seul le client peut se réinscrire, ` +
        "connecté, depuis « Mes préférences » de son espace.",
    );
  }
}

/** Confirmer un accord d'une adresse désinscrite : le lien de confirmation est arrivé trop tard. */
export class MarketingConfirmationAfterUnsubscribeError extends BusinessError {
  constructor(space: string) {
    super(
      "MAIL_MARKETING_CONFIRMATION_AFTER_UNSUBSCRIBE",
      `Cette adresse s'est désinscrite des e-mails de l'espace « ${space} » depuis la demande ` +
        "d'inscription : la confirmation est ignorée. Le client peut se réinscrire, connecté, " +
        "depuis « Mes préférences ».",
    );
  }
}

/**
 * Un accord sur une adresse non vérifiée demande un e-mail de confirmation
 * (règle 18), et cet espace ne peut pas en envoyer : pas d'origine publique
 * dans cet environnement, ou pas de modèle de confirmation pour lui
 * (aujourd'hui, seul `lfc` en a un). Rien n'a été rangé.
 */
export class MarketingConfirmationUnavailableError extends TechnicalError {
  constructor(space: string) {
    super(
      "MAIL_MARKETING_CONFIRMATION_UNAVAILABLE",
      `L'inscription aux e-mails de l'espace « ${space} » demande une confirmation par e-mail, ` +
        "que cet espace ne sait pas envoyer ici (origine publique non configurée, ou aucun " +
        "modèle de confirmation pour cet espace). Rien n'a été enregistré : régler l'origine " +
        "de l'espace, puis refaire le geste.",
    );
  }
}
