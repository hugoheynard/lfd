import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailRevealLedger } from "../domain/ports/mail-reveal.ledger.js";

/** La dernière révélation d'un envoi par une personne, dans `mail.mail_recipient_reveal`. */
@Injectable()
export class PrismaMailRevealLedger extends MailRevealLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lastRevealedAt(staffId: string, sendId: string): Promise<Date | null> {
    const row = await this.prisma.mailRecipientReveal.findFirst({
      where: { revealedBy: staffId, mailRequestId: sendId },
      orderBy: { revealedAt: "desc" },
      select: { revealedAt: true },
    });
    return row?.revealedAt ?? null;
  }
}
