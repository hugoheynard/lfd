import { UnknownMailBrandError } from "../errors/mail-request.errors.js";

/**
 * Les marques au nom desquelles le service envoie. La Folie Coffee seule
 * aujourd'hui (plan `plan-service-e-mails.md`, C2) ; la billetterie viendra
 * s'ajouter ici.
 */
export const MAIL_BRANDS = ["lfc"] as const;

export type MailBrandCode = (typeof MAIL_BRANDS)[number];

function isKnown(code: string): code is MailBrandCode {
  return MAIL_BRANDS.some((known) => known === code);
}

/** La marque d'une demande — refusée si le service ne la connaît pas. */
export class MailBrand {
  private constructor(readonly code: MailBrandCode) {}

  static of(code: string): MailBrand {
    if (!isKnown(code)) {
      throw new UnknownMailBrandError(code);
    }
    return new MailBrand(code);
  }
}
