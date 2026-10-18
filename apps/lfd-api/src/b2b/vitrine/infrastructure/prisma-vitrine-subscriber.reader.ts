import type { VitrineSubscriberView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VitrineSubscriberReader } from "../domain/ports/vitrine-subscriber.reader.js";
import { VitrineContents } from "../domain/vitrine-contents.js";
import { subscriberToView } from "./vitrine-subscriber.mapper.js";

/** Adaptateur Prisma de la lecture des abonnés. */
@Injectable()
export class PrismaVitrineSubscriberReader extends VitrineSubscriberReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly VitrineSubscriberView[]> {
    const rows = await this.prisma.vitrineSubscriber.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(subscriberToView);
  }

  async contentsForReadKey(readKeyHash: string): Promise<VitrineContents | null> {
    const row = await this.prisma.vitrineSubscriber.findUnique({
      where: { readKeyHash },
      select: { contents: true },
    });
    return row === null ? null : VitrineContents.of(row.contents);
  }
}
