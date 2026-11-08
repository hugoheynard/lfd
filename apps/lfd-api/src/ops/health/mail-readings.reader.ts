import { Injectable, Logger } from "@nestjs/common";
import type { NodeReading } from "@lfd/ops-contract";

import { MailDeliveryTally } from "../../platform/mailer/delivery-tally/mail-delivery-tally.js";
import { ResendWebhookChecker } from "../../platform/mailer/webhook/resend-webhook.checker.js";
import { Clock } from "../../platform/time/clock.js";
import { mailReadings, webhookReading, MAIL_WINDOW_DAYS } from "./mail-readings.js";

const DAY_MS = 86_400_000;

/**
 * Ce que le suivi des e-mails rend au nœud Resend.
 *
 * La sonde dit que Resend **répond** ; ces relevés disent que nos e-mails
 * **arrivent**. Ce n'est pas la même question, et c'est la seconde qui coûte
 * cher quand la réponse est non.
 *
 * Depuis T1b (`documentation/mail/le-suivi-des-e-mails.md`), le décompte vient
 * du bloc `mail` par le port `MailDeliveryTally` de `platform/` — plus
 * d'`ops.mail_send`, qui n'est plus écrite.
 */
@Injectable()
export class MailReadingsReader {
  private readonly logger = new Logger(MailReadingsReader.name);

  constructor(
    private readonly tally: MailDeliveryTally,
    private readonly clock: Clock,
    private readonly webhook: ResendWebhookChecker,
  ) {}

  async read(): Promise<readonly NodeReading[]> {
    const since = new Date(this.clock.now().getTime() - MAIL_WINDOW_DAYS * DAY_MS);
    // L'état de la déclaration passe DEVANT les volumes : un webhook désactivé
    // rend « 0 rejeté » indiscernable d'un canal parfait.
    const declaration = webhookReading(await this.webhook.check());
    try {
      const figures = await this.tally.read(since);
      return [...declaration, ...mailReadings(figures, figures.mostRejectedTemplate)];
    } catch (error) {
      // Une carte de santé ne tombe pas avec ce qu'elle observe.
      this.logger.warn("Relevés du courrier indisponibles", error);
      return declaration;
    }
  }
}
