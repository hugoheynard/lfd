/**
 * Ce que la copie d'image a le droit de télécharger : les origines admises, et
 * le nom du réglage qui les déclare, pour que le refus dise quoi régler.
 */
export interface MailImageAdmission {
  readonly origins: readonly string[];
  readonly originsVariable: string;
}

/** Jeton d'injection de {@link MailImageAdmission}, lu une fois dans `AppConfig`. */
export const MAIL_IMAGE_ADMISSION = Symbol("MAIL_IMAGE_ADMISSION");
