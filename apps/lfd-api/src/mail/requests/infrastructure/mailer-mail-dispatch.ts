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
import { composeMail } from "../../templates/effective-copy/mail-composition.js";

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
 */
@Injectable()
export class MailerMailDispatch extends MailDispatch {
  constructor(@Inject(MAILER) private readonly mailer: B2bMailer) {
    super();
  }

  async dispatch(mail: OutgoingMail): Promise<MailDispatchReceipt> {
    try {
      // La version du document qui compose l'e-mail, notée par le mailer
      // (S4c) : la demande la garde.
      const { result, documentVersion } = await composeMail(() =>
        this.mailer.send({
          to: mail.to,
          template: mail.template as keyof B2bMails,
          data: mail.data as B2bMails[keyof B2bMails],
          idempotencyKey: mail.idempotencyKey,
          ...(mail.replyTo === undefined ? {} : { replyTo: mail.replyTo }),
        }),
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
