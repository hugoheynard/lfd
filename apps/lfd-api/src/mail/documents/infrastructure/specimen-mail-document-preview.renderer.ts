import type { MailDocument, MailLocale } from "@lfd/mail-blocks";
import type { TemplateRegistry } from "@lfd/mailer";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import type { MailTextsByMail } from "../../copy/domain/mail-copy-texts.js";
import type { MailSpecimenRendering } from "../../copy/domain/ports/mail-specimen.renderer.js";
import { withInlineImages } from "../../copy/infrastructure/specimen-mail-preview.renderer.js";
import { CachedPublishedMailCopyReader } from "../../copy/infrastructure/cached-published-mail-copy.reader.js";
import { resolvePublishedMailCharter } from "../../templates/effective-copy/published-mail-charter-resolution.js";
import { PublishedMailCopyReader } from "../../templates/effective-copy/published-mail-copy.reader.js";
import { withMailCharter } from "../../templates/sections/mail-charter-scope.js";
import { mailBrandingOf } from "../../templates/mail-branding.js";
import { b2bMailTemplates, type B2bMails } from "../../templates/mail-templates.js";
import { mailCaseDataOf } from "../../templates/specimens/cases/mail-specimen-cases.js";
import { isMailKey, renderMailData } from "../../templates/specimens/mail-specimens.js";
import { UnknownMailCaseError, UnknownMailTemplateError } from "../domain/mail-document-errors.js";
import { MailDocumentPreviewRenderer } from "../domain/ports/mail-document-preview.renderer.js";

/**
 * Adaptateur de l'aperçu fidèle : le registre RÉEL des e-mails, la même
 * marque que le mailer, les données du cas demandé, et le document posé dans le
 * périmètre de mise en page exactement comme l'envoi le pose
 * (`MailLayoutScope.documents`), sous la charte publiée de son espace
 * (`withMailCharter`, § 25, C1). Sans repère : c'est ce qui partirait — sauf
 * l'image cadrée d'un brouillon, recadrée à l'affichage faute de copie.
 */
@Injectable()
export class SpecimenMailDocumentPreviewRenderer extends MailDocumentPreviewRenderer {
  private readonly registry: TemplateRegistry<B2bMails>;

  private readonly log = new Logger("MailEditorPreview");

  /**
   * @param published les chartes publiées, lues par le MÊME cache que
   *   l'envoi (`CachedPublishedMailCopyReader.charters()`).
   */
  constructor(
    config: AppConfig,
    @Inject(CachedPublishedMailCopyReader) private readonly published: PublishedMailCopyReader,
  ) {
    super();
    this.registry = b2bMailTemplates(mailBrandingOf(config));
  }

  async render(
    template: string,
    caseId: string,
    locale: MailLocale,
    texts: MailTextsByMail,
    document: MailDocument,
  ): Promise<MailSpecimenRendering> {
    if (!isMailKey(template)) {
      throw new UnknownMailTemplateError(template);
    }
    const data = mailCaseDataOf(template, caseId, locale);
    if (data === null) {
      throw new UnknownMailCaseError(template, caseId);
    }
    const charter = await resolvePublishedMailCharter(this.published, template, data, this.log);
    const rendered = withMailCharter(charter, () =>
      renderMailData(
        this.registry,
        template,
        data,
        { [locale]: texts },
        {
          orders: {},
          markers: false,
          // Un brouillon n'a pas encore de copie recadrée : l'aperçu la recadre
          // à l'affichage. L'envoi ne pose jamais cette option.
          documents: { [template]: { document, locale, framePreviewImages: true } },
        },
      ),
    );
    return {
      subject: rendered.subject,
      html: withInlineImages(rendered),
      attachments: (rendered.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType ?? null,
        inline: attachment.contentId !== undefined,
      })),
    };
  }
}
