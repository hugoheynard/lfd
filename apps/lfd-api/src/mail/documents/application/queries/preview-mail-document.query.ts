import type { MailDocument, MailLocale } from "@lfd/mail-blocks";

import type { MailCopySource } from "../../../copy/domain/mail-copy-locale.js";

/**
 * Query : l'aperçu fidèle d'un e-mail — ce document (sinon celui que
 * l'éditeur ouvrirait), les phrases de la source demandée, ses données
 * d'exemple. Une lecture : un `POST` seulement parce que le document voyage
 * dans le corps.
 */
export class PreviewMailDocumentQuery {
  constructor(
    readonly template: string,
    readonly locale: MailLocale,
    readonly source: MailCopySource,
    readonly document: MailDocument | null,
  ) {}
}
