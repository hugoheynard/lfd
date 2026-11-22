import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { PayLink } from "../domain/entities/pay-link.js";
import { PayLinkRepository } from "../domain/ports/pay-link.repository.js";

/**
 * **Les liens**, dans `card_payment.pay_link` — l'écrivain UNIQUE de la table.
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
      await this.prisma.$queryRaw`
        SELECT "id" FROM "card_payment"."pay_link"
        WHERE "subject_type" = ${subjectType} AND "subject_id" = ${subjectId}
          AND "revoked_at" IS NULL
        FOR UPDATE`;
    }
    const row = await this.prisma.payLink.findFirst({
      where: { subjectType, subjectId, revokedAt: null },
    });
    return row === null ? null : PayLink.rehydrate(row);
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
