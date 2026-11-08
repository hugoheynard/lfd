import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { MailSendFinder } from "../domain/ports/mail-send-finder.js";

/**
 * Les envois d'une adresse normalisée, par l'index `recipient_key`. Les
 * demandes d'avant T1 sans clé ont été remplies par la migration
 * `20261108120100`.
 */
@Injectable()
export class PrismaMailSendFinder extends MailSendFinder {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async idsByRecipientKey(recipientKey: string): Promise<readonly string[]> {
    const rows = await this.prisma.mailRequest.findMany({
      where: { recipientKey },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
