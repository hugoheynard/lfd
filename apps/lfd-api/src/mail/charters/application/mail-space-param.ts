import { isMailSpace, type MailSpace } from "@lfd/mail-blocks";

import { UnknownMailSpaceError } from "../domain/mail-charter-errors.js";

/**
 * L'espace d'une commande ou d'une requête : un paramètre de route n'est
 * qu'une chaîne, et un espace inconnu est un 404 nommé, pas un 400 de forme.
 *
 * @throws {UnknownMailSpaceError} ni `lfc`, ni `lfd`.
 */
export function mailSpaceOfParam(candidate: string): MailSpace {
  if (!isMailSpace(candidate)) {
    throw new UnknownMailSpaceError(candidate);
  }
  return candidate;
}
