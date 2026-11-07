import type { MailDocument, MailLocale, MailPreviewSituation } from "@lfd/mail-blocks";

import type { MailCopySource } from "../../../copy/domain/mail-copy-locale.js";
import { SPECIMEN_CASE_ID } from "../../../templates/specimens/cases/mail-specimen-case.types.js";

/**
 * Query : le document montré par l'éditeur, rendu bloc par bloc (plan
 * `plan-editeur-par-blocs.md`, § 22, S5f) — phrases de la source demandée,
 * données d'un cas, phrases et variables marquées. Une lecture : un `POST`
 * seulement parce que le document voyage dans le corps.
 */
export class PreviewMailDocumentBlocksQuery {
  constructor(
    readonly template: string,
    readonly locale: MailLocale,
    readonly source: MailCopySource,
    readonly document: MailDocument,
    readonly caseId: string = SPECIMEN_CASE_ID,
    /** § 24 : le cas passé en retrait ou en livraison ; `null` : tel quel. */
    readonly situation: MailPreviewSituation | null = null,
  ) {}
}
