import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../database/prisma.service.js";
import { IdGenerator } from "../../id/id-generator.js";
import { MailJournal } from "./mail-journal.port.js";

/**
 * Le registre des messages de webhook, dans le schéma `ops`
 * (`ops.webhook_event`). `ops.mail_send` n'est plus écrite depuis T1b.
 */
@Injectable()
export class PrismaMailJournal extends MailJournal {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
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
