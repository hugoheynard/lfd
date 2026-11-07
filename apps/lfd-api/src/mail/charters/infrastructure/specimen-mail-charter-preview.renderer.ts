import type { MailCharterSettings, MailLocale } from "@lfd/mail-blocks";
import { renderCharterOf, type TemplateRegistry } from "@lfd/mailer";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { CachedPublishedMailCopyReader } from "../../copy/infrastructure/cached-published-mail-copy.reader.js";
import { withInlineImages } from "../../copy/infrastructure/specimen-mail-preview.renderer.js";
import { mailBrandingOf } from "../../templates/mail-branding.js";
import { b2bMailTemplates, type B2bMails } from "../../templates/mail-templates.js";
import { withMailCharter } from "../../templates/sections/mail-charter-scope.js";
import { documentLocaleOf } from "../../templates/sections/mail-document-locale.js";
import { SPECIMEN_CASE_ID } from "../../templates/specimens/cases/mail-specimen-case.types.js";
import { mailCaseDataOf } from "../../templates/specimens/cases/mail-specimen-cases.js";
import { isMailKey, renderMailData } from "../../templates/specimens/mail-specimens.js";
import { MailCharterPreviewUnavailableError } from "../domain/mail-charter-errors.js";
import {
  MailCharterPreviewRenderer,
  type MailCharterPreview,
} from "../domain/ports/mail-charter-preview.renderer.js";

/**
 * Adaptateur de l'aperçu d'une charte : le registre RÉEL des e-mails, la
 * même marque que le mailer, l'exemple de l'e-mail, les phrases publiées —
 * et la charte de l'écran posée dans le périmètre exactement comme l'envoi
 * pose la charte publiée (`withMailCharter`). Le logo s'y montre à son
 * adresse d'origine, le logo embarqué incrusté comme dans l'aperçu fidèle.
 */
@Injectable()
export class SpecimenMailCharterPreviewRenderer extends MailCharterPreviewRenderer {
  private readonly registry: TemplateRegistry<B2bMails>;

  constructor(
    config: AppConfig,
    private readonly published: CachedPublishedMailCopyReader,
  ) {
    super();
    this.registry = b2bMailTemplates(mailBrandingOf(config));
  }

  async render(
    template: string,
    locale: MailLocale,
    settings: MailCharterSettings,
  ): Promise<MailCharterPreview> {
    const data = isMailKey(template) ? mailCaseDataOf(template, SPECIMEN_CASE_ID, locale) : null;
    if (!isMailKey(template) || data === null) {
      throw new MailCharterPreviewUnavailableError(template);
    }
    const overlay = await this.published.read();
    const charter = renderCharterOf(settings, documentLocaleOf(template, data));
    const rendered = withMailCharter(charter, () =>
      renderMailData(this.registry, template, data, overlay),
    );
    return { subject: rendered.subject, html: withInlineImages(rendered) };
  }
}
