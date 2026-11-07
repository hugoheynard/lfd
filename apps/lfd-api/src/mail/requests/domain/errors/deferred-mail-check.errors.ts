import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * L'e-mail différé de la sonde de déploiement n'est pas parti dans le délai
 * (plan `plan-service-e-mails.md`, § 25) : la chaîne différée — boîte
 * d'envoi, relais, abonné — ne tourne pas. Le déploiement est rouge.
 */
export class DeferredMailCheckTimeoutError extends TechnicalError {
  constructor(status: string, seconds: number) {
    super(
      "DEFERRED_MAIL_CHECK_TIMEOUT",
      `L'e-mail différé de contrôle est resté « ${status} » après ${seconds} s : ` +
        "la boîte d'envoi, le relais ou l'abonné ne tourne pas. " +
        "Lire les journaux du container (relais de la boîte d'envoi, « DeliverRequestedMail ») " +
        "avant de déclarer le déploiement sain.",
    );
  }
}

/**
 * L'e-mail différé de la sonde a échoué ou a été refusé : inutile d'attendre
 * la fin du délai, il ne partira pas de lui-même dans le temps de l'étape.
 */
export class DeferredMailCheckFailedError extends TechnicalError {
  constructor(status: string, reason: string | null) {
    super(
      "DEFERRED_MAIL_CHECK_FAILED",
      `L'e-mail différé de contrôle est passé « ${status} » ` +
        `(${reason ?? "sans raison rangée"}) : l'envoi différé échoue. ` +
        "Vérifier la clé et l'expéditeur Resend, puis relancer le contrôle.",
    );
  }
}
