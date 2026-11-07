import type { MailDocument, MailLocale } from "@lfd/mail-blocks";
import type { TemplateRegistry } from "@lfd/mailer";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import type { MailTextsByMail } from "../../copy/domain/mail-copy-texts.js";
import type { MailSpecimenRendering } from "../../copy/domain/ports/mail-specimen.renderer.js";
import { withInlineImages } from "../../copy/infrastructure/specimen-mail-preview.renderer.js";
import { mailBrandingOf } from "../../templates/mail-branding.js";
import { b2bMailTemplates, type B2bMails } from "../../templates/mail-templates.js";
import { isMailKey, renderMailSpecimen } from "../../templates/specimens/mail-specimens.js";
import { UnknownMailTemplateError } from "../domain/mail-document-errors.js";
import { MailDocumentPreviewRenderer } from "../domain/ports/mail-document-preview.renderer.js";

/**
 * Adaptateur de l'aperçu fidèle : le registre RÉEL des e-mails, la même
 * marque que le mailer, les données d'exemple, et le document posé dans le
 * périmètre de mise en page exactement comme l'envoi le pose
 * (`MailLayoutScope.documents`). Sans repère : c'est ce qui partirait.
 */
@Injectable()
export class SpecimenMailDocumentPreviewRenderer extends MailDocumentPreviewRenderer {
  private readonly registry: TemplateRegistry<B2bMails>;

  constructor(config: AppConfig) {
    super();
    this.registry = b2bMailTemplates(mailBrandingOf(config));
  }

  render(
    template: string,
    locale: MailLocale,
    texts: MailTextsByMail,
    document: MailDocument,
  ): MailSpecimenRendering {
    if (!isMailKey(template)) {
      throw new UnknownMailTemplateError(template);
    }
    const rendered = renderMailSpecimen(
      this.registry,
      template,
      locale,
      { [locale]: texts },
      { orders: {}, markers: false, documents: { [template]: { document, locale } } },
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
