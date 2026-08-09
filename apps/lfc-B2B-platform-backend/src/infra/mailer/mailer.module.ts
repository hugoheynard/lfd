import { createMailer, type Mailer, type MailerLogger } from "@lfd/mailer";
import { Global, Logger, Module } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { B2B_MAIL_TEMPLATES, type B2bMails } from "./mail-templates.js";

/** Jeton d'injection du mailer — les appelants injectent **ça**, jamais un adaptateur. */
export const MAILER = Symbol("MAILER");

/** Le type qu'un appelant écrit : le mailer, chargé de la carte de cette app. */
export type B2bMailer = Mailer<B2bMails>;

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
  providers: [
    {
      provide: MAILER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): B2bMailer => {
        const mailer = config.mailerConfig();
        return createMailer<B2bMails>({
          apiKey: mailer.apiKey,
          registry: B2B_MAIL_TEMPLATES,
          fromAddress: mailer.fromAddress,
          replyTo: mailer.replyTo,
          logger: nestLogger(),
        });
      },
    },
  ],
  exports: [MAILER],
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
