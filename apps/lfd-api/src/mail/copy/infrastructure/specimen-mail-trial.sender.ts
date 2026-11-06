import { isLayoutSectionId } from "@lfd/mailer";
import { Injectable } from "@nestjs/common";

import { Mail } from "../../channels/requests/mail.js";
import { withMailCopyOverlay } from "../../templates/copy/mail-copy-overlay.js";
import type { B2bMails } from "../../templates/mail-templates.js";
import { withMailLayout } from "../../templates/sections/mail-layout-scope.js";
import { isMailKey, specimenDataOf } from "../../templates/specimens/mail-specimens.js";
import { MailTrialSender } from "../domain/ports/mail-specimen.renderer.js";
import { UnknownMailError } from "../domain/mail-copy-errors.js";
import type { MailCopyLocale } from "../domain/mail-copy-locale.js";
import type { MailTextsByMail } from "../domain/mail-copy-texts.js";

/**
 * Adaptateur de l'essai : le VRAI mailer — transport, disjoncteur et journal
 * des envois compris —, avec les textes et l'ordre des sections choisis
 * ouverts en périmètre. Le mailer laisse un périmètre ouvert l'emporter sur
 * le publié (`EffectiveCopyMailer`) : l'essai d'un brouillon part avec le
 * brouillon.
 *
 * **Par le bloc `mail`, en `sendAndAwaitReceipt`** (lot S2h, `plan-service-e-mails.md`) :
 * le staff lit l'issue de l'essai à l'écran, et l'appelant envoie hors de son
 * unité de travail (`SendMailCopyTrialHandler`, relu le 2026-11-06). Le bloc
 * envoie dans la même chaîne asynchrone, donc sous le périmètre ouvert ici.
 * Une clé par intention (`mail-copy.trial:<intention>`, revue, cas 4) : le
 * bloc garde une clé un an ; un double clic n'envoie qu'un essai, et chaque
 * nouvel essai porte une clé neuve.
 */
@Injectable()
export class SpecimenMailTrialSender extends MailTrialSender {
  constructor(private readonly mail: Mail) {
    super();
  }

  async send(
    to: string,
    mail: string,
    locale: MailCopyLocale,
    texts: MailTextsByMail,
    order: readonly string[] | null,
    intentKey: string,
  ): Promise<void> {
    if (!isMailKey(mail)) {
      throw new UnknownMailError(mail);
    }
    // L'ordre choisi, SANS repères : l'essai est un vrai courriel.
    const layout = {
      orders: order === null ? {} : { [mail]: order.filter(isLayoutSectionId) },
      markers: false,
    };
    await withMailCopyOverlay({ [locale]: texts }, () =>
      withMailLayout(layout, () => this.sendSpecimen(to, mail, locale, intentKey)),
    );
  }

  private async sendSpecimen<K extends keyof B2bMails>(
    to: string,
    mail: K,
    locale: MailCopyLocale,
    intentKey: string,
  ): Promise<void> {
    await this.mail.sendAndAwaitReceipt({
      brand: "lfc",
      to,
      template: mail,
      data: specimenDataOf(mail, locale),
      idempotencyKey: `mail-copy.trial:${intentKey}`,
    });
  }
}
