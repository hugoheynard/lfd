import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { NoticeSendJournal } from "../domain/ports/notice-send.journal.js";

/**
 * `sub_account_notice_sends`, écrit dans la transaction ambiante (celle de la
 * garde du relais). `skipDuplicates` = `ON CONFLICT DO NOTHING` sur la clé
 * `(event_id, user_id)` : deux livraisons concurrentes ne servent qu'une fois.
 */
@Injectable()
export class PrismaNoticeSendJournal extends NoticeSendJournal {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async claim(eventId: string, userId: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.subAccountNoticeSend.createMany({
      data: [{ eventId, userId, sentAt: at }],
      skipDuplicates: true,
    });
    return count === 1;
  }
}
