import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type VitrineNoticeOpening,
  VitrineNoticeRepository,
} from "../domain/ports/vitrine-notice.repository.js";
import { VitrineNotice } from "../domain/vitrine-notice.js";

/** Adaptateur Prisma de l'écriture des annonces. */
@Injectable()
export class PrismaVitrineNoticeRepository extends VitrineNoticeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async idOfKey(idempotencyKey: string): Promise<string | null> {
    const row = await this.prisma.vitrineNotice.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * ⚠️ `P2002` est le cas NORMAL du double clic, pas une anomalie : la clé
   * d'idempotence est unique, et la base tranche. Toute autre erreur remonte.
   */
  async open(notice: VitrineNotice): Promise<VitrineNoticeOpening> {
    const { recipients, ...row } = notice.toPersistence();
    try {
      await this.prisma.vitrineNotice.create({
        data: { ...row, recipients: { create: recipients.map((r) => ({ ...r })) } },
      });
      return { opened: true };
    } catch (error) {
      const existingId = isUniqueViolation(error) ? await this.idOfKey(row.idempotencyKey) : null;
      if (existingId === null) {
        throw error;
      }
      return { opened: false, existingId };
    }
  }

  async load(id: string): Promise<VitrineNotice | null> {
    const row = await this.prisma.vitrineNotice.findUnique({
      where: { id },
      include: { recipients: { orderBy: { subscriberId: "asc" } } },
    });
    return row === null ? null : VitrineNotice.rehydrate(row);
  }

  /**
   * Seuls les destinataires dont l'issue est connue s'écrivent, et seulement
   * là où la base les tient encore « pas tentés » (`mail_sent IS NULL`) : une
   * issue consignée par une reprise concurrente n'est pas écrasée.
   */
  async save(notice: VitrineNotice): Promise<void> {
    const { id, recipients } = notice.toPersistence();
    await this.prisma.$transaction(
      recipients
        .filter((r) => r.mailSent !== null)
        .map((r) =>
          this.prisma.vitrineNoticeRecipient.updateMany({
            where: { noticeId: id, subscriberId: r.subscriberId, mailSent: null },
            data: { mailSent: r.mailSent, attemptedAt: r.attemptedAt },
          }),
        ),
    );
  }
}

/** Le code d'une violation d'unicité Prisma — le message change de version en version. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002";
}
