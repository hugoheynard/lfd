import type { ContactAccess } from '@lfd/contracts';

/**
 * Une carte de contact prête à afficher — vue **neutre** dérivée du contact et
 * de son emploi. L'app mappe son modèle (contact principal aplati + additionnels)
 * vers cette liste ; la carte ne connaît ni `Contact` ni `AccountService`.
 */
export interface CompanyContactCardView {
  /** Id du contact ; `null` pour le principal (aplati, non supprimable). */
  readonly contactId: string | null;
  readonly firstName: string;
  readonly lastName: string;
  /** Libellé sous le nom (« Admin du compte entreprise » ou la fonction). */
  readonly role: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
  /** Contact principal : première carte, non supprimable. */
  readonly isPrimary: boolean;
  /** C'est la personne connectée : carte accentuée + badge « Vous ». */
  readonly isYou: boolean;
  /**
   * Où en est son **accès** à l'espace — `null` quand la vue ne le sait pas.
   *
   * `null` n'est pas `'none'` : côté client, la liste des contacts ne porte
   * aucune information d'accès, et afficher « pas d'accès » serait une
   * affirmation que cet écran ne peut pas soutenir.
   */
  readonly access: ContactAccess | null;
  /** L'adresse a-t-elle été prouvée ? Sans objet quand `access` est `null`. */
  readonly emailVerified: boolean;
}
