import { BusinessError, DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un réglage du calendrier de prélèvement hors de ses bornes. */
export class InvalidCollectionScheduleError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("accounting.collection_schedule.invalid", `${field} : ${reason}`);
  }
}

/**
 * L'échéance tomberait avant la fin du délai de pré-notification.
 *
 * L'avis part à la constitution, le jour de la clôture ; l'échéance est la
 * clôture + N jours. Si N est plus court que le délai annoncé au débiteur
 * (mandat, CGV), on le prélèverait avant le terme qu'on lui a promis — et
 * chaque débit serait contestable. La seule sortie légitime est contractuelle :
 * réduire le délai de pré-notification, ce qui suppose la clause écrite dans
 * les CGV pro et le mandat (plan `plan-prelevement-automatique.md`, § 3, Q1).
 *
 * Levée dans les DEUX sens : régler N sous le délai, ou porter le délai
 * au-dessus d'un N déjà réglé.
 */
export class CollectionBeforeNoticeError extends BusinessError {
  constructor(
    readonly collectionDaysAfterClosure: number,
    readonly preNotificationDays: number,
  ) {
    super(
      "accounting.collection_schedule.before_notice",
      `L'échéance à la clôture + ${String(collectionDaysAfterClosure)} jours tomberait avant la fin ` +
        `du délai de pré-notification de ${String(preNotificationDays)} jours : le débiteur serait ` +
        `prélevé avant le terme annoncé. Choisissez une échéance d'au moins ` +
        `${String(preNotificationDays)} jours après la clôture, ou réduisez d'abord le délai de ` +
        `pré-notification — ce qui exige la clause correspondante dans les CGV pro et le mandat.`,
    );
  }
}
