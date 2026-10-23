import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MailCopyAdminReader,
  type MailCopyPublicationState,
} from "../domain/ports/mail-copy-admin.reader.js";
import type { MailCopyEntryState } from "../domain/mail-copy-entry.js";
import { MAIL_COPY_PUBLICATION_KEY, toStates } from "./mail-copy-rows.js";

/** Adaptateur Prisma de l'éditeur et de l'aperçu : toutes les lignes, la publication. */
@Injectable()
export class PrismaMailCopyAdminReader extends MailCopyAdminReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async entries(): Promise<readonly MailCopyEntryState[]> {
    const rows = await this.prisma.mailCopyEntry.findMany({
      orderBy: [{ mail: "asc" }, { path: "asc" }, { locale: "asc" }],
    });
    return toStates(rows);
  }

  async publication(): Promise<MailCopyPublicationState> {
    const row = await this.prisma.mailCopyPublication.findUnique({
      where: { key: MAIL_COPY_PUBLICATION_KEY },
    });
    return {
      version: row?.version ?? 0,
      publishedAt: row?.publishedAt ?? null,
      publishedBy: row?.publishedBy ?? null,
    };
  }
}
