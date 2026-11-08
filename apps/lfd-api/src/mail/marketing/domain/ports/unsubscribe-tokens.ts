import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";

/** Ce qu'un jeton de désinscription désigne : un espace et une clé d'adresse. */
export interface UnsubscribeTarget {
  readonly space: MailBrandCode;
  readonly recipientKey: string;
}

/**
 * Port du **jeton de désinscription** (plan de désinscription, règle 4 et
 * contradiction) : chiffré et authentifié, il ne laisse pas lire l'adresse
 * dans une URL, et ne permet que de désinscrire — cet espace, ou tout le
 * groupe pour l'adresse qu'il chiffre (règle 20). Sans expiration.
 */
export abstract class UnsubscribeTokens {
  abstract seal(target: UnsubscribeTarget): string;

  /** `null` : un jeton altéré, scellé sous une autre clé, ou mal formé. */
  abstract open(token: string): UnsubscribeTarget | null;
}
