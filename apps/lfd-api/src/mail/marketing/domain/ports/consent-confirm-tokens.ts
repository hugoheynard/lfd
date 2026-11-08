import type { MailBrandCode } from "../../../requests/domain/value-objects/mail-brand.js";

/** Ce qu'un jeton de confirmation désigne : la demande d'accord d'une adresse dans un espace. */
export interface ConsentConfirmTarget {
  readonly space: MailBrandCode;
  readonly recipientKey: string;
  /** L'instant de la demande : il date le lien (7 jours) et le rend unique. */
  readonly issuedAt: Date;
}

/**
 * Port du **jeton de confirmation d'un accord** (plan de désinscription,
 * règle 18) : de la même famille que celui de désinscription — chiffré et
 * authentifié, sans adresse lisible dans l'URL — sous sa propre clé dérivée.
 * Il ne permet que de confirmer la demande qu'il désigne.
 */
export abstract class ConsentConfirmTokens {
  abstract seal(target: ConsentConfirmTarget): string;

  /** `null` : un jeton altéré, scellé sous une autre clé, ou mal formé. */
  abstract open(token: string): ConsentConfirmTarget | null;
}
