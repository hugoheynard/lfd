import { createResendInboundReader } from "@lfd/mailer";
import { Global, Module } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { InboundMailReader } from "./inbound/inbound-mail.reader.js";
import { ResendInboundMailReader } from "./inbound/resend-inbound-mail.reader.js";
import { MailJournal } from "./journal/mail-journal.port.js";
import { PrismaMailJournal } from "./journal/prisma-mail-journal.js";
import { ReceiveResendEventHandler } from "./webhook/receive-resend-event.handler.js";
import { ResendWebhookChecker } from "./webhook/resend-webhook.checker.js";
import { ResendWebhookController } from "./webhook/resend-webhook.controller.js";

/**
 * Ce qui reste du mailer dans la plateforme : le journal des envois, le
 * webhook Resend (lu par `ops`) et la lecture des e-mails reçus.
 *
 * Le mailer lui-même — le transport de `@lfd/mailer` chargé des gabarits, le
 * texte effectif et le journal par-dessus — est composé dans le bloc `mail`
 * depuis le lot S3b (`mail/templates/mail-transport.providers.ts`) : il porte
 * les gabarits, que `platform` ne peut pas connaître.
 */
@Global()
@Module({
  // Le contrôle de mise en service vivait ici ; il est dans le bloc `mail`
  // depuis le lot S2h (`mail/requests/http/mail-check.controller.ts`) : tout
  // e-mail passe par le bloc, et une sonde qui le contournerait resterait
  // verte avec un bloc cassé. Il éprouve le mailer du bloc, par `sendNow`.
  controllers: [ResendWebhookController],
  providers: [
    { provide: MailJournal, useClass: PrismaMailJournal },
    ResendWebhookChecker,
    ReceiveResendEventHandler,
    {
      // La lecture des e-mails REÇUS (plan `plan-reponses-par-e-mail.md`, R2) :
      // sans clé, rien ne se lit — et rien n'arrive, la réception se règle chez Resend.
      provide: InboundMailReader,
      inject: [AppConfig],
      useFactory: (config: AppConfig): InboundMailReader => {
        const { apiKey } = config.mailerConfig();
        return new ResendInboundMailReader(
          apiKey === null ? null : createResendInboundReader(apiKey),
        );
      },
    },
  ],
  exports: [MailJournal, ResendWebhookChecker, InboundMailReader],
})
export class MailerModule {}
