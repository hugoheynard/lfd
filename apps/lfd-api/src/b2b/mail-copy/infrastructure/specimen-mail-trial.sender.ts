import { Inject, Injectable } from "@nestjs/common";

import { withMailCopyOverlay } from "../../../platform/mailer/copy/mail-copy-overlay.js";
import type { B2bMails } from "../../../platform/mailer/mail-templates.js";
import { MAILER, type B2bMailer } from "../../../platform/mailer/mailer.tokens.js";
import { isMailKey, specimenDataOf } from "../../../platform/mailer/specimens/mail-specimens.js";
import { MailTrialSender } from "../domain/ports/mail-specimen.renderer.js";
import { UnknownMailError } from "../domain/mail-copy-errors.js";
import type { MailCopyLocale } from "../domain/mail-copy-locale.js";
import type { MailTextsByMail } from "../domain/mail-copy-texts.js";

/**
 * Adaptateur de l'essai : le VRAI mailer — transport, disjoncteur et journal
 * des envois compris —, avec les textes choisis ouverts en périmètre. Le
 * mailer laisse un périmètre ouvert l'emporter sur le publié
 * (`EffectiveCopyMailer`) : l'essai d'un brouillon part avec le brouillon.
 */
@Injectable()
export class SpecimenMailTrialSender extends MailTrialSender {
  constructor(@Inject(MAILER) private readonly mailer: B2bMailer) {
    super();
  }

  async send(
    to: string,
    mail: string,
    locale: MailCopyLocale,
    texts: MailTextsByMail,
  ): Promise<void> {
    if (!isMailKey(mail)) {
      throw new UnknownMailError(mail);
    }
    await withMailCopyOverlay({ [locale]: texts }, () => this.sendSpecimen(to, mail, locale));
  }

  private async sendSpecimen<K extends keyof B2bMails>(
    to: string,
    mail: K,
    locale: MailCopyLocale,
  ): Promise<void> {
    await this.mailer.send({ to, template: mail, data: specimenDataOf(mail, locale) });
  }
}
