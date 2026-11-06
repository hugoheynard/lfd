import { Injectable } from "@nestjs/common";

import { MailTemplatePreview } from "../../../mail/channels/templates/mail-template-preview.js";
import {
  type RenderedVitrineNotice,
  VitrineNoticeMailRenderer,
} from "../domain/ports/vitrine-notice-mail.renderer.js";
import type { VitrineNoticeText } from "../domain/vitrine-notice-text.js";

/**
 * Le rendu de l'aperçu par le gabarit MÊME de l'envoi, demandé au bloc `mail`
 * par son canal (`MailTemplatePreview`, lot S3b) : l'aperçu et l'e-mail ne
 * peuvent pas diverger.
 */
@Injectable()
export class TemplateVitrineNoticeMailRenderer extends VitrineNoticeMailRenderer {
  constructor(private readonly preview: MailTemplatePreview) {
    super();
  }

  render(text: VitrineNoticeText): RenderedVitrineNotice {
    return this.preview.render("agency.vitrine-notice", {
      subject: text.subject,
      message: text.message,
    });
  }
}
