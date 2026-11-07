import type { MailDocument, MailLocale } from "@lfd/mail-blocks";

import type { MailTextsByMail } from "../../../copy/domain/mail-copy-texts.js";
import type { MailSpecimenRendering } from "../../../copy/domain/ports/mail-specimen.renderer.js";

/**
 * Port de **l'aperçu fidèle** (plan `plan-editeur-par-blocs.md`, § 6) : le
 * VRAI gabarit d'un e-mail, sur les données d'un de ses cas, avec ces phrases et CE
 * document — rendu comme l'envoi le rendrait, sans repère. N'écrit rien,
 * n'envoie rien.
 */
export abstract class MailDocumentPreviewRenderer {
  /**
   * @throws {UnknownMailTemplateError} l'e-mail n'est pas au registre.
   * @throws {UnknownMailCaseError} l'e-mail n'a pas ce cas.
   */
  abstract render(
    template: string,
    caseId: string,
    locale: MailLocale,
    texts: MailTextsByMail,
    document: MailDocument,
  ): MailSpecimenRendering;
}
