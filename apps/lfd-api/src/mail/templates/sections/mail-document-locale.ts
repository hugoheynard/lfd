import { MAIL_LOCALES, type MailLocale } from "@lfd/mail-blocks";

import { DEFAULT_MAIL_LOCALE } from "../../channels/templates/mail-locale.js";
import type { B2bMails } from "../mail-templates.js";
import { mailBlockDeclarationOf } from "./mail-block-declarations.js";
import { MAIL_LAYOUTS } from "./mail-layouts.js";

function isRegisteredMail(mail: string): mail is keyof B2bMails {
  return Object.hasOwn(MAIL_LAYOUTS, mail);
}

function isMailLocale(candidate: unknown): candidate is MailLocale {
  return MAIL_LOCALES.some((locale) => locale === candidate);
}

/**
 * **La langue des blocs libres d'un envoi** (plan `plan-editeur-par-blocs.md`,
 * S4c) : celle des données si le modèle part dans la langue de son
 * destinataire et la déclare, sinon la première qu'il déclare — le français
 * pour les e-mails qui ne partent qu'en français (`DEFAULT_MAIL_LOCALE`).
 * Jamais une langue que le gabarit ne rendrait pas : le titre serait en
 * français et l'encadré en anglais.
 */
export function documentLocaleOf(mail: string, data: unknown): MailLocale {
  if (!isRegisteredMail(mail)) {
    return DEFAULT_MAIL_LOCALE;
  }
  const declared = mailBlockDeclarationOf(mail).locales;
  const asked =
    typeof data === "object" && data !== null && "locale" in data ? data.locale : undefined;
  if (isMailLocale(asked) && declared.includes(asked)) {
    return asked;
  }
  return declared[0] ?? DEFAULT_MAIL_LOCALE;
}
