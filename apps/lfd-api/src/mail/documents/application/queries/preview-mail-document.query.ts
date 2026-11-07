import type { MailDocument, MailLocale } from "@lfd/mail-blocks";

import { SPECIMEN_CASE_ID } from "../../../templates/specimens/cases/mail-specimen-case.types.js";
import type { MailCopySource } from "../../../copy/domain/mail-copy-locale.js";

/**
 * Query : l'aperçu fidèle d'un e-mail — ce document (sinon celui que
 * l'éditeur ouvrirait), les phrases de la source demandée, les données
 * d'un de ses cas. Une lecture : un `POST` seulement parce que le document
 * voyage dans le corps.
 */
export class PreviewMailDocumentQuery {
  constructor(
    readonly template: string,
    readonly locale: MailLocale,
    readonly source: MailCopySource,
    readonly document: MailDocument | null,
    /** Le cas rendu (S4d) — `"specimen"`, l'exemple de l'e-mail, faute d'autre. */
    readonly caseId: string = SPECIMEN_CASE_ID,
  ) {}
}
