import { isLayoutSectionId, type RenderedMail, type TemplateRegistry } from "@lfd/mailer";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { mailBrandingOf } from "../../../platform/mailer/mail-branding.js";
import { b2bMailTemplates, type B2bMails } from "../../../platform/mailer/mail-templates.js";
import {
  revealTextMarkers,
  stripTextMarkers,
} from "../../../platform/mailer/sections/mail-text-markers.js";
import {
  isMailKey,
  renderMailSpecimen,
} from "../../../platform/mailer/specimens/mail-specimens.js";
import {
  MailSpecimenRenderer,
  type MailSpecimenRendering,
} from "../domain/ports/mail-specimen.renderer.js";
import { UnknownMailError } from "../domain/mail-copy-errors.js";
import type { MailCopyLocale } from "../domain/mail-copy-locale.js";
import type { MailTextsByMail } from "../domain/mail-copy-texts.js";

/**
 * Adaptateur de l'aperçu : le registre RÉEL des e-mails, avec la même marque
 * que le mailer (`mailBrandingOf`), sur les données d'exemple du mailer
 * (`platform/mailer/specimens/`).
 *
 * Les images du corps partent en pièce jointe `cid:` — qu'un navigateur ne
 * sait pas afficher : l'aperçu les incruste en `data:`, et le HTML envoyé,
 * lui, n'est pas touché.
 *
 * L'aperçu est REPÉRÉ (E4, S4) : chaque section rendue est dans un
 * `<div data-mail-section="…">`, chaque texte du dictionnaire dans un
 * `<span data-mail-text="<chemin>" data-mail-text-of="<e-mail>">`. Ces
 * repères n'existent que dans ce périmètre : l'essai et l'envoi ne les
 * ouvrent jamais.
 */
@Injectable()
export class SpecimenMailPreviewRenderer extends MailSpecimenRenderer {
  private readonly registry: TemplateRegistry<B2bMails>;

  constructor(config: AppConfig) {
    super();
    this.registry = b2bMailTemplates(mailBrandingOf(config));
  }

  render(
    mail: string,
    locale: MailCopyLocale,
    texts: MailTextsByMail,
    order: readonly string[] | null,
  ): MailSpecimenRendering {
    if (!isMailKey(mail)) {
      throw new UnknownMailError(mail);
    }
    const rendered = renderMailSpecimen(
      this.registry,
      mail,
      locale,
      { [locale]: texts },
      { orders: order === null ? {} : { [mail]: order.filter(isLayoutSectionId) }, markers: true },
    );
    return {
      subject: stripTextMarkers(rendered.subject),
      html: revealTextMarkers(withInlineImages(rendered)),
      attachments: (rendered.attachments ?? []).map((attachment) => ({
        filename: stripTextMarkers(attachment.filename),
        contentType: attachment.contentType ?? null,
        inline: attachment.contentId !== undefined,
      })),
    };
  }
}

/** Le HTML, chaque `cid:` remplacé par l'image elle-même. */
function withInlineImages(rendered: RenderedMail): string {
  return (rendered.attachments ?? []).reduce((html, attachment) => {
    if (attachment.contentId === undefined) {
      return html;
    }
    const type = attachment.contentType ?? "application/octet-stream";
    return html
      .split(`cid:${attachment.contentId}`)
      .join(`data:${type};base64,${attachment.contentBase64}`);
  }, rendered.html);
}
