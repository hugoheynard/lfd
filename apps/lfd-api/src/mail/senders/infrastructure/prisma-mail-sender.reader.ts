import { isMailSpace, type MailNature, type MailSpace } from "@lfd/mail-blocks";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailSpaceSenderState } from "../domain/mail-space-sender.js";
import { MailSenderReader } from "../domain/ports/mail-sender.reader.js";
import { toSenderState } from "./mail-sender-rows.js";

/** La lecture des identités d'envoi, dans le schéma `mail`. */
@Injectable()
export class PrismaMailSenderReader extends MailSenderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async stateOf(space: MailSpace, nature: MailNature): Promise<MailSpaceSenderState | null> {
    const row = await this.prisma.mailSenderIdentity.findUnique({
      where: { space_nature: { space, nature } },
    });
    return row === null ? null : toSenderState(row);
  }

  async configuredSpaces(): Promise<readonly MailSpace[]> {
    const rows = await this.prisma.mailSenderIdentity.findMany({
      where: { nature: "transactional" },
      select: { space: true },
      orderBy: { space: "asc" },
    });
    return rows.map((row) => row.space).filter(isMailSpace);
  }
}
