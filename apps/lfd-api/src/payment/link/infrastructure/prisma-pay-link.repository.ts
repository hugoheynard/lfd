import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import type { CardSubject } from "../../channels/subjects/subject-settlement.js";
import { lockRows } from "../../shared/infrastructure/row-lock.js";
import { PayLink } from "../domain/entities/pay-link.js";
import { PayLinkRepository } from "../domain/ports/pay-link.repository.js";

/**
 * **Les liens**, dans `payment.pay_link` — l'écrivain UNIQUE de la table.
 * Passe par le client ambiant : sous une unité de travail, il écrit dans la
 * transaction de l'appelant.
 *
 * Les gardes de la base (un lien vivant par sujet, la révocation posée en
 * paire et une seule fois, aucun DELETE) sont dans
 * `20261122100000_les_liens_vers_un_sujet`.
 */
@Injectable()
export class PrismaPayLinkRepository extends PayLinkRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * `skipDuplicates` (`ON CONFLICT DO NOTHING` sans cible : toutes les
   * unicités, l'index partiel du lien vivant compris) plutôt qu'un `create`
   * rattrapé : une violation annulerait la transaction de l'appelant.
   */
  async addIfAbsent(link: PayLink): Promise<boolean> {
    const { count } = await this.prisma.payLink.createMany({
      data: [link.toPersistence()],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async liveOf(subjectType: string, subjectId: string): Promise<PayLink | null> {
    if (currentTransaction() !== undefined) {
      await lockRows(
        this.prisma,
        "pay_link",
        Prisma.sql`"subject_type" = ${subjectType} AND "subject_id" = ${subjectId}
          AND "revoked_at" IS NULL`,
      );
    }
    const row = await this.prisma.payLink.findFirst({
      where: { subjectType, subjectId, revokedAt: null },
    });
    return row === null ? null : PayLink.rehydrate(row);
  }

  async liveOfAll(subjects: readonly CardSubject[]): Promise<readonly PayLink[]> {
    if (subjects.length === 0) {
      return [];
    }
    const idsByType = new Map<string, string[]>();
    for (const subject of subjects) {
      idsByType.set(subject.type, [...(idsByType.get(subject.type) ?? []), subject.id]);
    }
    const rows = await this.prisma.payLink.findMany({
      where: {
        revokedAt: null,
        OR: [...idsByType].map(([subjectType, ids]) => ({ subjectType, subjectId: { in: ids } })),
      },
    });
    return rows.map((row) => PayLink.rehydrate(row));
  }

  async byTokenHash(tokenHash: string): Promise<PayLink | null> {
    const row = await this.prisma.payLink.findUnique({ where: { tokenHash } });
    return row === null ? null : PayLink.rehydrate(row);
  }

  /** Seule la révocation bouge : le reste est immuable (déclencheur). */
  async save(link: PayLink): Promise<void> {
    const row = link.toPersistence();
    await this.prisma.payLink.update({
      where: { id: row.id },
      data: { revokedAt: row.revokedAt, revokedReason: row.revokedReason },
    });
  }
}
