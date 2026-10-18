import type { VitrineNoticeView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { VitrineNoticeReader } from "../domain/ports/vitrine-notice.reader.js";
import type { VitrineNoticeCandidate } from "../domain/vitrine-notice-audience.js";
import { noticeToView } from "./vitrine-notice.mapper.js";

/** Adaptateur Prisma de la lecture des annonces. */
@Injectable()
export class PrismaVitrineNoticeReader extends VitrineNoticeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async candidates(): Promise<readonly VitrineNoticeCandidate[]> {
    const rows = await this.prisma.vitrineSubscriber.findMany({
      select: { id: true, name: true, contactEmail: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({ subscriberId: r.id, name: r.name, contactEmail: r.contactEmail }));
  }

  async recent(limit: number): Promise<readonly VitrineNoticeView[]> {
    const rows = await this.prisma.vitrineNotice.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      include: { recipients: { orderBy: { subscriberId: "asc" } } },
    });
    const names = await this.prisma.vitrineSubscriber.findMany({
      select: { id: true, name: true },
    });
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    return rows.map((row) => noticeToView(row, nameOf));
  }
}
