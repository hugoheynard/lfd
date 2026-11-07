import { renderCharterOf, type MailRenderCharter } from "@lfd/mailer";

import { documentLocaleOf } from "../sections/mail-document-locale.js";
import { mailSpaceOf } from "../sections/mail-block-declarations.js";
import { MAIL_LAYOUTS } from "../sections/mail-layouts.js";
import type { B2bMails } from "../mail-templates.js";
import type { PublishedMailCopyReader } from "./published-mail-copy.reader.js";

/** Où dire qu'une charte publiée n'a pas pu s'appliquer. */
export interface MailCharterResolutionLog {
  warn(message: string): void;
}

function isRegisteredMail(mail: string): mail is keyof B2bMails {
  return Object.hasOwn(MAIL_LAYOUTS, mail);
}

/**
 * **La charte que le rendu de cet e-mail applique** (plan
 * `plan-editeur-par-blocs.md`, § 25, C1) : la charte publiée de son espace,
 * dans la langue du rendu — ou `null`, la charte de départ (le rendu
 * d'avant, à l'octet). Un seul chemin pour l'envoi (`EffectiveCopyMailer`)
 * et pour les rendus de l'éditeur (aperçu fidèle, fragments du canevas) :
 * ce que l'écran montre est ce qui part.
 *
 * Charte illisible par ce code, ou lecture en échec : charte de départ, et
 * le journal le dit — jamais d'échec du rendu pour une charte.
 */
export async function resolvePublishedMailCharter(
  published: PublishedMailCopyReader | null,
  template: string,
  data: unknown,
  log: MailCharterResolutionLog,
): Promise<MailRenderCharter | null> {
  if (published === null || !isRegisteredMail(template)) {
    return null;
  }
  const space = mailSpaceOf(template);
  try {
    const entry = (await published.charters())[space];
    if (entry === undefined) {
      return null;
    }
    if (entry.kind === "unreadable") {
      log.warn(
        `Charte publiée v${String(entry.version)} de l'espace « ${space} » illisible par ce code : « ${template} » part avec la charte de départ.`,
      );
      return null;
    }
    return renderCharterOf(entry.settings, documentLocaleOf(template, data));
  } catch (error: unknown) {
    log.warn(
      `Chartes publiées illisibles : « ${template} » part avec la charte de départ. Cause : ${String(error)}`,
    );
    return null;
  }
}
