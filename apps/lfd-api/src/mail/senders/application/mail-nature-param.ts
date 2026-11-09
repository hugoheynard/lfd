import { MAIL_NATURES, type MailNature } from "@lfd/mail-blocks";

import { UnknownMailNatureError } from "../domain/mail-sender-errors.js";

/**
 * La nature d'une commande ou d'une requête (lot U5) : un paramètre de route
 * n'est qu'une chaîne, et une nature inconnue est un 404 nommé.
 *
 * @throws {UnknownMailNatureError} ni `transactional`, ni `marketing`.
 */
export function mailNatureOfParam(candidate: string): MailNature {
  const nature = MAIL_NATURES.find((known) => known === candidate);
  if (nature === undefined) {
    throw new UnknownMailNatureError(candidate);
  }
  return nature;
}
