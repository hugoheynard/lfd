/**
 * Ce que la copie d'image a le droit de télécharger : l'origine de la
 * médiathèque, seule admise ; et ce qu'elle n'a pas à copier, ce qui est déjà à elle.
 */
export interface MailImageAdmission {
  readonly origins: readonly string[];
  /**
   * L'adresse publique du stockage du bloc, sans barre finale, ou `null` :
   * une image qui y est déjà est une copie, elle ne se recopie pas (S5d).
   */
  readonly publicBaseUrl: string | null;
}

/** Jeton d'injection de {@link MailImageAdmission}, lu une fois dans `AppConfig`. */
export const MAIL_IMAGE_ADMISSION = Symbol("MAIL_IMAGE_ADMISSION");
