import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service.js";
import { IdGenerator } from "../../id/id-generator.js";
import {
  MailJournal,
  outranks,
  type MailOutcome,
  type MailSendRecord,
  type MailStatus,
} from "./mail-journal.port.js";

/**
 * Le journal du courrier, dans le schéma `ops`.
 *
 * **Rien ici n'a le droit de faire échouer un envoi.** Le journal accompagne
 * l'e-mail, il ne le conditionne pas : perdre une ligne d'historique est
 * regrettable, ne pas envoyer l'invitation d'un client ne l'est pas.
 */
@Injectable()
export class PrismaMailJournal extends MailJournal {
  private readonly logger = new Logger(PrismaMailJournal.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async recordSend(record: MailSendRecord): Promise<void> {
    try {
      await this.prisma.mailSend.create({
        data: {
          id: `mailsend_${this.ids.next()}`,
          providerId: record.providerId,
          template: record.template,
          recipient: record.recipient,
          sentAt: record.at,
          statusAt: record.at,
        },
      });
    } catch (error) {
      this.logger.warn("Journal du courrier : envoi non consigné", error);
    }
  }

  /**
   * Applique l'issue **si elle apporte quelque chose**.
   *
   * Les webhooks n'ont aucune garantie d'ordre : un « envoyé » qui arriverait
   * après un « rebondi » effacerait l'information la plus importante. On ne
   * remplace donc que vers le haut (cf. `outranks`), et un identifiant inconnu
   * est ignoré sans bruit — c'est un e-mail parti avant que ce journal existe.
   */
  async recordOutcome(outcome: MailOutcome): Promise<void> {
    try {
      const current = await this.prisma.mailSend.findUnique({
        where: { providerId: outcome.providerId },
        select: { id: true, status: true },
      });
      if (current === null || !outranks(outcome.status, statusOf(current.status))) {
        return;
      }
      await this.prisma.mailSend.update({
        where: { id: current.id },
        data: { status: outcome.status, statusAt: outcome.at, detail: outcome.detail },
      });
    } catch (error) {
      this.logger.warn("Journal du courrier : issue non consignée", error);
    }
  }

  /**
   * L'unicité est portée par la **base**, pas par un `findFirst` suivi d'un
   * `create` : deux livraisons simultanées du même événement passeraient toutes
   * les deux la vérification applicative, et compteraient deux rebonds pour un.
   */
  async rememberEvent(provider: string, externalId: string): Promise<boolean> {
    const inserted = await this.prisma.webhookEvent.createMany({
      data: [{ id: `webhookevent_${this.ids.next()}`, provider, externalId }],
      skipDuplicates: true,
    });
    return inserted.count > 0;
  }
}

/** Un statut relu de la base. Une valeur inconnue retombe sur le plus bas rang. */
function statusOf(raw: string): MailStatus {
  const known: readonly MailStatus[] = ["sent", "delayed", "delivered", "complained", "bounced"];
  return known.find((status) => status === raw) ?? "sent";
}
