import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailCopyEntryState } from "../domain/mail-copy-entry.js";
import { MAIL_COPY_PUBLICATION_KEY, toStates } from "./mail-copy-rows.js";
import { PublishedMailCopyStore } from "./published-mail-copy.store.js";

/** Adaptateur Prisma des deux lectures du cache du publié. */
@Injectable()
export class PrismaPublishedMailCopyStore extends PublishedMailCopyStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async version(): Promise<number> {
    const row = await this.prisma.mailCopyPublication.findUnique({
      where: { key: MAIL_COPY_PUBLICATION_KEY },
      select: { version: true },
    });
    return row?.version ?? 0;
  }

  async published(): Promise<readonly MailCopyEntryState[]> {
    const rows = await this.prisma.mailCopyEntry.findMany({
      where: { publishedText: { not: null } },
    });
    return toStates(rows);
  }
}
