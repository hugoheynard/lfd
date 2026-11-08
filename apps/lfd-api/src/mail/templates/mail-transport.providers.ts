import { createMailer, type MailerLogger } from "@lfd/mailer";
import { Logger, type Provider } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import { EffectiveCopyMailer } from "./effective-copy/effective-copy-mailer.js";
import { PublishedMailCopyReader } from "./effective-copy/published-mail-copy.reader.js";
import { mailBrandingOf } from "./mail-branding.js";
import { b2bMailTemplates, type B2bMails } from "./mail-templates.js";
import { MAIL_TRANSPORT, MAILER, type B2bMailer } from "./mailer.tokens.js";

/**
 * **Le mailer du bloc** : le transport de `@lfd/mailer` (à blanc sans clé,
 * sinon Resend derrière son disjoncteur) chargé des gabarits, sous le texte
 * effectif. (Le journal d'`ops.mail_send` l'enveloppait jusqu'à T1b : le suivi
 * du bloc le remplace.)
 *
 * Composé dans `platform/mailer/mailer.module.ts` jusqu'au lot S3b ; il porte
 * les gabarits, et `platform` ne connaît aucun bloc : il est servi par
 * `MailModule`, à l'identique.
 */
export const MAIL_TRANSPORT_PROVIDERS: readonly Provider[] = [
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
    inject: [MAIL_TRANSPORT, { token: PublishedMailCopyReader, optional: true }],
    useFactory: (transport: B2bMailer, published: PublishedMailCopyReader | undefined): B2bMailer =>
      // Le texte effectif (le publié, sinon le code). Le port du publié est
      // relié par `appBootstrap/` (`MailCopySourceModule`) ; absent — un
      // module de test qui ne monte pas le contexte des textes —, les
      // e-mails partent avec le code. Le webhook retrouve un envoi par la
      // demande du suivi, qui range son `provider_id` (T1).
      new EffectiveCopyMailer(transport, published ?? null, new Logger("Mailer")),
  },
];

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
