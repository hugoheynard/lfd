import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CollectionNotice } from "../domain/entities/collection-notice.js";
import { CollectionNoticeRepository } from "../domain/ports/collection-notice.repository.js";
import { noticeColumns, noticeStateColumns, toNoticeState } from "./collection-notice.mapper.js";

/** Adaptateur d'écriture des avis : création avec le lot, puis l'état seul. */
@Injectable()
export class PrismaCollectionNoticeRepository extends CollectionNoticeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async insertAll(notices: readonly CollectionNotice[]): Promise<void> {
    if (notices.length === 0) {
      return;
    }
    await this.prisma.collectionNotice.createMany({
      data: notices.map((notice) => noticeColumns(notice.toPersistence())),
    });
  }

  async load(noticeId: string): Promise<CollectionNotice | null> {
    const row = await this.prisma.collectionNotice.findUnique({ where: { id: noticeId } });
    return row === null ? null : CollectionNotice.rehydrate(toNoticeState(row));
  }

  async save(notice: CollectionNotice): Promise<void> {
    const state = notice.toPersistence();
    await this.prisma.collectionNotice.update({
      where: { id: state.id },
      data: noticeStateColumns(state),
    });
  }
}
