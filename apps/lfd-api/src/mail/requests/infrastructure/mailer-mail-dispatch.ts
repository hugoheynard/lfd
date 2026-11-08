import { MailerError, MailerIdempotencyInFlightError } from "@lfd/mailer";
import { Inject, Injectable } from "@nestjs/common";

import type { B2bMails } from "../../templates/mail-templates.js";
import { MAILER, type B2bMailer } from "../../templates/mailer.tokens.js";
import { MailInFlightError, MailRefusedError } from "../domain/errors/mail-request.errors.js";
import {
  MailDispatch,
  type MailDispatchReceipt,
  type OutgoingMail,
} from "../domain/ports/mail-dispatch.js";
import type { MarketingMarks } from "../domain/ports/marketing-clearance.js";
import { composeMail } from "../../templates/effective-copy/mail-composition.js";
import { documentLocaleOf } from "../../templates/sections/mail-document-locale.js";
import {
  unsubscribeFooterOf,
  withMailUnsubscribe,
} from "../../templates/sections/mail-unsubscribe-scope.js";

/**
 * Les en-têtes de la RFC 8058 (plan de désinscription, règle 3) : le bouton
 * « Se désabonner » de Gmail et d'Apple Mail, et son POST « One-Click ». Pas
 * de `mailto:` — personne ne traiterait ces e-mails.
 */
export function unsubscribeHeadersOf(marks: MarketingMarks): Readonly<Record<string, string>> {
  return {
    "List-Unsubscribe": `<${marks.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * L'envoi par le mailer d'aujourd'hui — texte effectif, journal, disjoncteur,
 * mode à blanc compris (`mail/templates/mail-transport.providers.ts` depuis S3b). Le rendu ne
 * change pas en S1.
 *
 * ## Le seul endroit où le type du modèle est repris sur parole
 *
 * Le compilateur a vérifié le couple modèle × données chez l'appelant
 * (`Mail`). Une demande différée l'a ensuite traversé en `jsonb`, d'où
 * elle revient sans type. Le contrat de chaque modèle (schéma Zod, plan C3)
 * n'existe pas encore pour la revalider : les assertions ci-dessous disent
 * cette confiance, au seul point où elle s'exerce. Elles tomberont avec C3.
 *
 * ## Les marques d'un e-mail marketing (plan de désinscription, U3)
 *
 * Posées ICI, par le bloc, jamais par l'appelant : le pied de désinscription
 * (phrase système, dans la langue de l'envoi) est injecté au rendu par un
 * périmètre, et les en-têtes RFC 8058 accompagnent l'envoi.
 */
@Injectable()
export class MailerMailDispatch extends MailDispatch {
  constructor(@Inject(MAILER) private readonly mailer: B2bMailer) {
    super();
  }

  async dispatch(mail: OutgoingMail, marks: MarketingMarks | null): Promise<MailDispatchReceipt> {
    try {
      const send = (): ReturnType<B2bMailer["send"]> =>
        this.mailer.send({
          to: mail.to,
          template: mail.template as keyof B2bMails,
          data: mail.data as B2bMails[keyof B2bMails],
          idempotencyKey: mail.idempotencyKey,
          ...(mail.replyTo === undefined ? {} : { replyTo: mail.replyTo }),
          ...(marks === null ? {} : { headers: unsubscribeHeadersOf(marks) }),
        });
      // La version du document qui compose l'e-mail, notée par le mailer
      // (S4c) : la demande la garde.
      const { result, documentVersion } = await composeMail(() =>
        marks === null
          ? send()
          : withMailUnsubscribe(
              unsubscribeFooterOf(documentLocaleOf(mail.template, mail.data), marks.unsubscribeUrl),
              send,
            ),
      );
      return { providerId: result.providerId, documentVersion };
    } catch (error) {
      // Une requête de même clé en cours chez Resend : ni échec, ni refus.
      if (error instanceof MailerIdempotencyInFlightError) {
        throw new MailInFlightError(error);
      }
      // Une erreur « métier » du mailer ne guérit pas d'un nouvel essai.
      if (error instanceof MailerError && error.category === "business") {
        throw new MailRefusedError(error.message, error);
      }
      throw error;
    }
  }
}
