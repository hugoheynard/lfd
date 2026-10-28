import { createMailer, createResendInboundReader, type MailerLogger } from "@lfd/mailer";
import { Global, Logger, Module } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { AfterCommit } from "../database/after-commit.js";
import { BackgroundWork } from "../events/background-work.js";
import { Clock } from "../time/clock.js";
import { AdminMailCheckController } from "./admin-mail-check.controller.js";
import { InboundMailReader } from "./inbound/inbound-mail.reader.js";
import { ResendInboundMailReader } from "./inbound/resend-inbound-mail.reader.js";
import { JournalingMailer } from "./journal/journaling-mailer.js";
import { MailJournal } from "./journal/mail-journal.port.js";
import { PrismaMailJournal } from "./journal/prisma-mail-journal.js";
import { ReceiveResendEventHandler } from "./webhook/receive-resend-event.handler.js";
import { ResendWebhookChecker } from "./webhook/resend-webhook.checker.js";
import { ResendWebhookController } from "./webhook/resend-webhook.controller.js";
import { mailBrandingOf } from "./mail-branding.js";
import { b2bMailTemplates, type B2bMails } from "./mail-templates.js";
import { MAIL_TRANSPORT, MAILER, type B2bMailer } from "./mailer.tokens.js";
import { EffectiveCopyMailer } from "./effective-copy/effective-copy-mailer.js";
import { PublishedMailCopyReader } from "./effective-copy/published-mail-copy.reader.js";

// Ré-exportés pour que les appelants existants continuent d'écrire
// `from "…/mailer.module.js"` — cf. mailer.tokens.ts pour la raison du fichier.
export { MAILER };
export type { B2bMailer };

/**
 * Le mailer transactionnel de la plateforme.
 *
 * Global, comme la configuration : n'importe quel module doit pouvoir prévenir
 * l'équipe sans réimporter une chaîne de modules. Le choix de l'adaptateur (à
 * blanc sans clé, sinon Resend derrière son disjoncteur) vit dans `@lfd/mailer`
 * — ici on ne fait que lui passer la configuration et le registre.
 */
@Global()
@Module({
  // Le contrôle de mise en service vit ici plutôt que dans un module `ops/` : il
  // n'a d'autre dépendance que le mailer et la configuration, et le garder à
  // côté de l'adaptateur qu'il éprouve évite qu'on le déplace un jour sans voir
  // ce qu'il teste réellement.
  controllers: [AdminMailCheckController, ResendWebhookController],
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
    {
      provide: MAIL_TRANSPORT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): B2bMailer => {
        const mailer = config.mailerConfig();
        return createMailer<B2bMails>({
          apiKey: mailer.apiKey,
          // La marque est construite ICI, pas déclarée dans les gabarits :
          // l'adresse de recours est l'admin RACINE, la seule que le domaine
          // protège de toute suppression ou renommage. Une adresse de support
          // qui disparaît envoie quelqu'un attendre.
          registry: b2bMailTemplates(mailBrandingOf(config)),
          fromAddress: mailer.fromAddress,
          replyTo: mailer.replyTo,
          logger: nestLogger(),
        });
      },
    },
    {
      provide: MAILER,
      inject: [
        MAIL_TRANSPORT,
        { token: PublishedMailCopyReader, optional: true },
        MailJournal,
        Clock,
        BackgroundWork,
        AfterCommit,
      ],
      useFactory: (
        transport: B2bMailer,
        published: PublishedMailCopyReader | undefined,
        journal: MailJournal,
        clock: Clock,
        work: BackgroundWork,
        afterCommit: AfterCommit,
      ): B2bMailer => {
        // Le texte effectif d'abord (le publié, sinon le code), puis le
        // journal par-dessus. Le port du publié est relié par `appBootstrap/`
        // (`MailCopySourceModule`) ; absent — un module de test qui ne monte
        // pas le contexte des textes —, les e-mails partent avec le code.
        const effective = new EffectiveCopyMailer(
          transport,
          published ?? null,
          new Logger("Mailer"),
        );
        // Le journal ENVELOPPE le mailer : `@lfd/mailer` est partagé et ne
        // connaît ni Nest, ni Prisma, ni l'idée qu'une app tienne un registre.
        // C'est l'app qui décide de garder une trace — et sans elle, le webhook
        // Resend serait muet d'avance : il donne un identifiant fournisseur
        // auquel rien, de notre côté, ne correspondrait.
        return new JournalingMailer(effective, journal, clock, work, afterCommit);
      },
    },
  ],
  exports: [MAILER, MailJournal, ResendWebhookChecker, InboundMailReader],
})
export class MailerModule {}

/** Adapte le journal de Nest au port étroit du paquet (qui ignore Nest). */
function nestLogger(): MailerLogger {
  const logger = new Logger("Mailer");
  return {
    info: (message, context) => logger.log(format(message, context)),
    warn: (message, context) => logger.warn(format(message, context)),
    error: (message, context) => logger.error(format(message, context)),
  };
}

function format(message: string, context?: Readonly<Record<string, unknown>>): string {
  return context === undefined ? message : `${message} ${JSON.stringify(context)}`;
}
