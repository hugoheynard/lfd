import type { MailLocale } from "@lfd/mail-blocks";

import type { MailTemplateEntry } from "../domain/ports/mail-template-catalogue.js";

/**
 * La langue rendue par un aperçu : celle demandée si le modèle la parle,
 * sinon la sienne. Partagée par l'aperçu fidèle et l'aperçu par blocs (S5f).
 */
export function renderedLocale(entry: MailTemplateEntry, asked: MailLocale): MailLocale {
  return entry.declaration.locales.includes(asked)
    ? asked
    : (entry.declaration.locales[0] ?? asked);
}
