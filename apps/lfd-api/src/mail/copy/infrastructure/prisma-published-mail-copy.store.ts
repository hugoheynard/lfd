import type { StoredMailSender } from "../../senders/application/servable-mail-sender.js";
import type { StoredPublishedMailCharter } from "../../charters/application/servable-mail-charter.js";
import type { StoredPublishedMailDocument } from "../../documents/application/servable-mail-document.js";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailCopyEntryState } from "../domain/mail-copy-entry.js";
import type { MailSectionOrderState } from "../domain/mail-section-order.js";
import { MAIL_COPY_PUBLICATION_KEY, toStates } from "./mail-copy-rows.js";
import { toOrderState } from "./mail-section-order-rows.js";
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

  async publishedSectionOrders(): Promise<readonly MailSectionOrderState[]> {
    const rows = await this.prisma.mailSectionOrderEntry.findMany({
      where: { NOT: { publishedOrder: { isEmpty: true } } },
    });
    return rows.map(toOrderState);
  }

  async publishedDocuments(): Promise<readonly StoredPublishedMailDocument[]> {
    const rows = await this.prisma.mailDocument.findMany({
      where: { publishedVersion: { not: null } },
      select: { template: true, publishedVersion: true, published: true },
    });
    return rows.flatMap((row) =>
      row.publishedVersion === null
        ? []
        : [{ template: row.template, version: row.publishedVersion, document: row.published }],
    );
  }

  async publishedCharters(): Promise<readonly StoredPublishedMailCharter[]> {
    const rows = await this.prisma.mailCharter.findMany({
      where: { publishedVersion: { not: null } },
      select: { space: true, publishedVersion: true, published: true },
    });
    return rows.flatMap((row) =>
      row.publishedVersion === null
        ? []
        : [{ space: row.space, version: row.publishedVersion, settings: row.published }],
    );
  }

  async senders(): Promise<readonly StoredMailSender[]> {
    return this.prisma.mailSenderIdentity.findMany({
      select: {
        space: true,
        nature: true,
        senderName: true,
        fromAddress: true,
        replyToAddress: true,
      },
    });
  }
}
