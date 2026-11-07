import { senderHeaderOf, type MailSenderIdentity, type MailSpace } from "@lfd/mail-blocks";
import { MailerSendError } from "@lfd/mailer";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { Mail } from "../../channels/requests/mail.js";
import { MailRefusedError } from "../../requests/domain/errors/mail-request.errors.js";
import { withMailSender } from "../../templates/sections/mail-sender-scope.js";
import { MailSenderTrialRefusedError } from "../domain/mail-sender-errors.js";
import { MailSenderTrial } from "../domain/ports/mail-sender-trial.js";

/**
 * L'essai d'une identité d'envoi **par la porte du bloc**, en
 * `sendAndAwaitReceipt` : l'enregistrement dépend de l'acceptation par
 * Resend, l'auteur lit l'issue à l'écran. L'identité proposée est ouverte en
 * périmètre (`withMailSender`) : le mailer la prend à la place de celle de
 * l'espace.
 *
 * Le modèle est `ops.deploy-check` — « le courrier sortant fonctionne »,
 * avec la révision servie et l'expéditeur : exactement ce que l'essai
 * atteste. Une clé par intention (`mail-sender.trial:<intention>`) : un
 * double clic n'envoie qu'un essai.
 */
@Injectable()
export class MailPortSenderTrial extends MailSenderTrial {
  constructor(
    private readonly mail: Mail,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async send(
    space: MailSpace,
    identity: MailSenderIdentity,
    to: string,
    intentKey: string,
  ): Promise<void> {
    try {
      await withMailSender(identity, () =>
        this.mail.sendAndAwaitReceipt({
          to,
          template: "ops.deploy-check",
          data: { revision: this.config.revision(), fromAddress: senderHeaderOf(identity) },
          idempotencyKey: `mail-sender.trial:${intentKey}`,
        }),
      );
    } catch (error) {
      // Un refus de Resend (domaine, adresse) sort en `MailerSendError` : le
      // mailer ne distingue pas un refus d'une panne, l'auteur lit la cause.
      if (error instanceof MailRefusedError || error instanceof MailerSendError) {
        throw new MailSenderTrialRefusedError(space, error);
      }
      throw error;
    }
  }
}
