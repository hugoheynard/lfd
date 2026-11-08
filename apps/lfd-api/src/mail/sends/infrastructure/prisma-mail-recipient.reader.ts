import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MailRecipientReader,
  type RevealedMailRecipient,
} from "../domain/ports/mail-recipient.reader.js";

/** L'adresse et la raison d'un échec : lues seulement après une révélation vérifiée. */
@Injectable()
export class PrismaMailRecipientReader extends MailRecipientReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async recipientOf(sendId: string): Promise<RevealedMailRecipient | null> {
    const row = await this.prisma.mailRequest.findUnique({
      where: { id: sendId },
      select: { recipient: true, failureReason: true },
    });
    return row === null ? null : { recipient: row.recipient, failureReason: row.failureReason };
  }
}
