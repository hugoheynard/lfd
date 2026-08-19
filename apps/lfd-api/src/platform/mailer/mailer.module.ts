import { createMailer, type MailerLogger } from "@lfd/mailer";
import { Global, Logger, Module } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { Clock } from "../time/clock.js";
import { AdminMailCheckController } from "./admin-mail-check.controller.js";
import { JournalingMailer } from "./journal/journaling-mailer.js";
import { MailJournal } from "./journal/mail-journal.port.js";
import { PrismaMailJournal } from "./journal/prisma-mail-journal.js";
import { ResendWebhookController } from "./webhook/resend-webhook.controller.js";
import { b2bMailTemplates, type B2bMails } from "./mail-templates.js";
import { MAILER, type B2bMailer } from "./mailer.tokens.js";

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
    {
      provide: MAILER,
      inject: [AppConfig, MailJournal, Clock],
      useFactory: (config: AppConfig, journal: MailJournal, clock: Clock): B2bMailer => {
        const mailer = config.mailerConfig();
        // Le journal ENVELOPPE le mailer : `@lfd/mailer` est partagé et ne
        // connaît ni Nest, ni Prisma, ni l'idée qu'une app tienne un registre.
        // C'est l'app qui décide de garder une trace — et sans elle, le webhook
        // Resend serait muet d'avance : il donne un identifiant fournisseur
        // auquel rien, de notre côté, ne correspondrait.
        const inner = createMailer<B2bMails>({
          apiKey: mailer.apiKey,
          // La marque est construite ICI, pas déclarée dans les gabarits :
          // l'adresse de recours est l'admin RACINE, la seule que le domaine
          // protège de toute suppression ou renommage. Une adresse de support
          // qui disparaît envoie quelqu'un attendre.
          registry: b2bMailTemplates({
            supportEmail: config.bootstrapAdminEmail(),
            backOfficeUrl: config.adminBaseUrl() ?? "",
          }),
          fromAddress: mailer.fromAddress,
          replyTo: mailer.replyTo,
          logger: nestLogger(),
        });
        return new JournalingMailer(inner, journal, clock);
      },
    },
  ],
  exports: [MAILER, MailJournal],
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
