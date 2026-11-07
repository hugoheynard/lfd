import { MAIL_SPACES } from "@lfd/mail-blocks";

import { UnknownMailBrandError } from "../errors/mail-request.errors.js";

/**
 * Les marques au nom desquelles le service envoie : **les espaces** (plan
 * `plan-editeur-par-blocs.md`, § 25, C3 — une marque = un espace). Ajouter
 * une app, c'est ajouter un espace ; la contrainte
 * `mail.mail_request.brand` suit la même liste.
 */
export const MAIL_BRANDS = MAIL_SPACES;

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
