import type { MailCharterSettings, MailSpace } from "@lfd/mail-blocks";

import { DomainError } from "../../../platform/shared/errors/app-error.js";
import {
  MailCharterLogoRefusedError,
  MailCharterLogoUnavailableError,
} from "../domain/mail-charter-errors.js";
import type { MailCharterLogo } from "../domain/ports/mail-charter-logo.js";

/**
 * **Copie le logo d'une charte** avant sa publication (plan
 * `plan-editeur-par-blocs.md`, § 25 ; S5d pour le mécanisme) : rend
 * l'adresse de la copie, ou `null` si la charte garde le logo embarqué.
 *
 * Réseau : à appeler HORS de toute transaction. Une copie faite avant un
 * refus reste rangée — adressée par son contenu, aucun e-mail ne la lit tant
 * que rien n'est publié.
 *
 * @throws {MailCharterLogoRefusedError} l'image elle-même est refusée.
 * @throws {MailCharterLogoUnavailableError} téléchargement ou stockage en panne.
 */
export async function copyCharterLogo(
  space: MailSpace,
  settings: MailCharterSettings,
  logo: MailCharterLogo,
): Promise<string | null> {
  if (settings.logo === null) {
    return null;
  }
  try {
    return await logo.copy(settings.logo.src);
  } catch (cause) {
    if (cause instanceof DomainError) {
      throw new MailCharterLogoRefusedError(space, cause);
    }
    throw cause instanceof Error ? new MailCharterLogoUnavailableError(space, cause) : cause;
  }
}
