import { isLayoutSectionId } from "@lfd/mailer";
import { Injectable } from "@nestjs/common";

import { MailRequests } from "../../channels/requests/mail-requests.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
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
 * **Par le bloc `mail`, en `sendNow`** (lot S2h, `plan-service-e-mails.md`) :
 * le staff lit l'issue de l'essai à l'écran, et l'appelant envoie hors de son
 * unité de travail (`SendMailCopyTrialHandler`, relu le 2026-11-06). Le bloc
 * envoie dans la même chaîne asynchrone, donc sous le périmètre ouvert ici.
 * Une clé par essai (`mail-copy.trial:<id>`) : le bloc garde une clé un an,
 * et chaque clic doit repartir.
 */
@Injectable()
export class SpecimenMailTrialSender extends MailTrialSender {
  constructor(
    private readonly mails: MailRequests,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async send(
    to: string,
    mail: string,
    locale: MailCopyLocale,
    texts: MailTextsByMail,
    order: readonly string[] | null,
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
      withMailLayout(layout, () => this.sendSpecimen(to, mail, locale)),
    );
  }

  private async sendSpecimen<K extends keyof B2bMails>(
    to: string,
    mail: K,
    locale: MailCopyLocale,
  ): Promise<void> {
    await this.mails.sendNow({
      brand: "lfc",
      to,
      template: mail,
      data: specimenDataOf(mail, locale),
      idempotencyKey: `mail-copy.trial:${this.ids.next()}`,
    });
  }
}
