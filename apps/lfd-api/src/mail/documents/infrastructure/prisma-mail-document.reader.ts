import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MailDocumentReader,
  type MailDocumentVersionRecord,
} from "../domain/ports/mail-document.reader.js";
import type { MailTemplateDocumentState } from "../domain/mail-template-document.js";
import { toDocumentState } from "./mail-document-rows.js";

/** Adaptateur Prisma de la lecture de l'éditeur. */
@Injectable()
export class PrismaMailDocumentReader extends MailDocumentReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async all(): Promise<readonly MailTemplateDocumentState[]> {
    const rows = await this.prisma.mailDocument.findMany({ orderBy: { template: "asc" } });
    return rows.map(toDocumentState);
  }

  async stateOf(template: string): Promise<MailTemplateDocumentState | null> {
    const row = await this.prisma.mailDocument.findUnique({ where: { template } });
    return row === null ? null : toDocumentState(row);
  }

  async versions(template: string): Promise<readonly MailDocumentVersionRecord[]> {
    const rows = await this.prisma.mailDocumentVersion.findMany({
      where: { template },
      orderBy: { version: "desc" },
      select: { version: true, publishedAt: true, publishedBy: true },
    });
    return rows.map((row) => ({
      version: row.version,
      stamp: { at: row.publishedAt, staffId: row.publishedBy },
    }));
  }
}
