import type { MailSpace } from "@lfd/mail-blocks";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailSpaceCharterState, PublishedMailCharter } from "../domain/mail-space-charter.js";
import { MailCharterReader } from "../domain/ports/mail-charter.reader.js";
import { toCharterState, toPublishedCharter } from "./mail-charter-rows.js";

/** Adaptateur Prisma de la lecture de la page « Charte ». */
@Injectable()
export class PrismaMailCharterReader extends MailCharterReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async stateOf(space: MailSpace): Promise<MailSpaceCharterState | null> {
    const row = await this.prisma.mailCharter.findUnique({ where: { space } });
    return row === null ? null : toCharterState(row);
  }

  async versions(space: MailSpace): Promise<readonly PublishedMailCharter[]> {
    const rows = await this.prisma.mailCharterVersion.findMany({
      where: { space },
      orderBy: { version: "desc" },
    });
    return rows.map(toPublishedCharter);
  }
}
