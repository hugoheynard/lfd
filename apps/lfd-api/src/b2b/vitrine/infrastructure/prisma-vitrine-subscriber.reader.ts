import type { VitrineSubscriberView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type VitrineReadKeyHolder,
  VitrineSubscriberReader,
} from "../domain/ports/vitrine-subscriber.reader.js";
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

  async holderOfReadKey(readKeyHash: string): Promise<VitrineReadKeyHolder | null> {
    const row = await this.prisma.vitrineSubscriber.findUnique({
      where: { readKeyHash },
      select: { contents: true, active: true },
    });
    return row === null ? null : { contents: VitrineContents.of(row.contents), active: row.active };
  }
}
