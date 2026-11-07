import { MAIL_SPACES, senderDomainOf } from "@lfd/mail-blocks";
import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { MailSenderReader } from "../domain/ports/mail-sender.reader.js";

/**
 * **Le repli dit au démarrage** (plan `plan-editeur-par-blocs.md`, § 25, C3 :
 * « repli unique et visible ») : chaque espace sans identité d'envoi rangée
 * part sous l'identité par défaut de la configuration (`MAILER_FROM_ADDRESS`),
 * et le journal de l'API le dit une fois, au démarrage. Le domaine seul y
 * figure — aucune adresse dans un journal.
 *
 * Une base qui ne répond pas ne retient pas le démarrage : le rappel est
 * remplacé par un avertissement.
 */
@Injectable()
export class MailSenderBootReport implements OnApplicationBootstrap {
  private readonly log = new Logger("MailSenders");

  constructor(
    private readonly reader: MailSenderReader,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    let configured: readonly string[];
    try {
      configured = await this.reader.configuredSpaces();
    } catch (error: unknown) {
      this.log.warn(
        `Identités d'envoi des espaces illisibles au démarrage : chaque e-mail tentera de les relire à l'envoi. Cause : ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const fallbackDomain = senderDomainOf(
      this.config.mailerConfig().fromAddress.replace(/>\s*$/, ""),
    );
    for (const space of MAIL_SPACES.filter((candidate) => !configured.includes(candidate))) {
      this.log.log(
        `L'espace d'e-mails « ${space} » n'a pas d'identité d'envoi : ses e-mails partent sous l'identité par défaut de la configuration (MAILER_FROM_ADDRESS, domaine ${fallbackDomain}).`,
      );
    }
  }
}
