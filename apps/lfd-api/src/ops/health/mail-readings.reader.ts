import { Injectable, Logger } from "@nestjs/common";
import type { NodeReading } from "@lfd/ops-contract";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { Clock } from "../../platform/time/clock.js";
import { ResendWebhookChecker } from "../../platform/mailer/webhook/resend-webhook.checker.js";
import { mailReadings, webhookReading, MAIL_WINDOW_DAYS, type MailTally } from "./mail-readings.js";

/** Les états qui comptent comme « personne n'a rien reçu ». */
const REJECTED = ["bounced", "complained"];

/**
 * Ce que le journal du courrier rend au nœud Resend.
 *
 * La sonde dit que Resend **répond** ; ces relevés disent que nos e-mails
 * **arrivent**. Ce n'est pas la même question, et c'est la seconde qui coûte
 * cher quand la réponse est non.
 */
@Injectable()
export class MailReadingsReader {
  private readonly logger = new Logger(MailReadingsReader.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly webhook: ResendWebhookChecker,
  ) {}

  async read(): Promise<readonly NodeReading[]> {
    const since = new Date(this.clock.now().getTime() - MAIL_WINDOW_DAYS * 86_400_000);
    // L'état de la déclaration passe DEVANT les volumes : un webhook désactivé
    // rend « 0 rejeté » indiscernable d'un canal parfait.
    const declaration = webhookReading(await this.webhook.check());
    try {
      const [byStatus, byTemplate] = await Promise.all([
        this.prisma.mailSend.groupBy({
          by: ["status"],
          where: { sentAt: { gte: since } },
          _count: { _all: true },
        }),
        this.prisma.mailSend.groupBy({
          by: ["template"],
          where: { sentAt: { gte: since }, status: { in: REJECTED } },
          _count: { _all: true },
          orderBy: { _count: { template: "desc" } },
          take: 1,
        }),
      ]);
      return [...declaration, ...mailReadings(tallyOf(byStatus), byTemplate[0]?.template ?? null)];
    } catch (error) {
      // Une carte de santé ne tombe pas avec ce qu'elle observe.
      this.logger.warn("Relevés du courrier indisponibles", error);
      return declaration;
    }
  }
}

interface StatusGroup {
  readonly status: string;
  readonly _count: { readonly _all: number };
}

/** Les états connus, en VALEURS : c'est ce qui permet de narrower sans affirmer. */
const STATES: readonly (keyof MailTally)[] = [
  "sent",
  "delayed",
  "delivered",
  "bounced",
  "complained",
];

/**
 * Range les groupes par état. Un état que le contrat ne connaît plus — écrit par
 * une version antérieure — est **ignoré** plutôt que promu de force : il ne
 * fausse alors qu'un total, au lieu de fausser une catégorie.
 */
function tallyOf(groups: readonly StatusGroup[]): MailTally {
  const tally = { sent: 0, delayed: 0, delivered: 0, bounced: 0, complained: 0 };
  for (const group of groups) {
    const state = STATES.find((known) => known === group.status);
    if (state !== undefined) {
      tally[state] = group._count._all;
    }
  }
  return tally;
}
