import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { mailBrandingOf } from "../../../platform/mailer/mail-branding.js";
import { b2bMailTemplates } from "../../../platform/mailer/mail-templates.js";
import {
  type RenderedVitrineNotice,
  VitrineNoticeMailRenderer,
} from "../domain/ports/vitrine-notice-mail.renderer.js";
import type { VitrineNoticeText } from "../domain/vitrine-notice-text.js";

/**
 * Le rendu de l'aperçu par le gabarit MÊME de l'envoi, avec la marque même du
 * mailer (`mailBrandingOf`) : l'aperçu et l'e-mail ne peuvent pas diverger.
 */
@Injectable()
export class TemplateVitrineNoticeMailRenderer extends VitrineNoticeMailRenderer {
  constructor(private readonly config: AppConfig) {
    super();
  }

  render(text: VitrineNoticeText): RenderedVitrineNotice {
    const template = b2bMailTemplates(mailBrandingOf(this.config))["agency.vitrine-notice"];
    const { subject, html } = template({ subject: text.subject, message: text.message });
    return { subject, html };
  }
}
