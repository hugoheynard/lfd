import { MailerError, MailerIdempotencyInFlightError } from "@lfd/mailer";
import { Inject, Injectable } from "@nestjs/common";

import type { B2bMails } from "../../../platform/mailer/mail-templates.js";
import { MAILER, type B2bMailer } from "../../../platform/mailer/mailer.tokens.js";
import { MailInFlightError, MailRefusedError } from "../domain/errors/mail-request.errors.js";
import { MailDispatch, type OutgoingMail } from "../domain/ports/mail-dispatch.js";

/**
 * L'envoi par le mailer d'aujourd'hui — texte effectif, journal, disjoncteur,
 * mode à blanc compris (`platform/mailer/mailer.module.ts`). Le rendu ne
 * change pas en S1.
 *
 * ## Le seul endroit où le type du modèle est repris sur parole
 *
 * Le compilateur a vérifié le couple modèle × données chez l'appelant
 * (`MailRequests`). Une demande différée l'a ensuite traversé en `jsonb`, d'où
 * elle revient sans type. Le contrat de chaque modèle (schéma Zod, plan C3)
 * n'existe pas encore pour la revalider : les assertions ci-dessous disent
 * cette confiance, au seul point où elle s'exerce. Elles tomberont avec C3.
 */
@Injectable()
export class MailerMailDispatch extends MailDispatch {
  constructor(@Inject(MAILER) private readonly mailer: B2bMailer) {
    super();
  }

  async dispatch(mail: OutgoingMail): Promise<string | null> {
    try {
      const receipt = await this.mailer.send({
        to: mail.to,
        template: mail.template as keyof B2bMails,
        data: mail.data as B2bMails[keyof B2bMails],
        idempotencyKey: mail.idempotencyKey,
        ...(mail.replyTo === undefined ? {} : { replyTo: mail.replyTo }),
      });
      return receipt.providerId;
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
