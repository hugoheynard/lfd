import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PurgeCensus } from "../../../platform/retention/purge-mode.js";
import { MailConsultationPruner } from "../domain/ports/mail-consultation.pruner.js";

/**
 * La purge des consultations du suivi : `mail_recipient_reveal` puis
 * `mail_recipient_search`, plus vieilles que la frontière (1 an).
 *
 * Une suppression PHYSIQUE, admise comme celle du suivi : ces tables ne sont
 * pas un agrégat métier, elles décident d'un accès de 5 minutes et portent
 * l'identifiant d'une personne du staff ; la trace durable est au journal.
 * Elle ne s'exécute qu'en mode `on` (`MAIL_REQUEST_PURGE`). Les révélations
 * d'abord ; un lot entamé sur elles se complète sur les recherches.
 */
@Injectable()
export class PrismaMailConsultationPruner extends MailConsultationPruner {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async census(cutoff: Date): Promise<PurgeCensus> {
    const [reveals, searches, oldestReveal, oldestSearch] = await Promise.all([
      this.prisma.mailRecipientReveal.count({ where: { revealedAt: { lt: cutoff } } }),
      this.prisma.mailRecipientSearch.count({ where: { searchedAt: { lt: cutoff } } }),
      this.prisma.mailRecipientReveal.aggregate({
        where: { revealedAt: { lt: cutoff } },
        _min: { revealedAt: true },
      }),
      this.prisma.mailRecipientSearch.aggregate({
        where: { searchedAt: { lt: cutoff } },
        _min: { searchedAt: true },
      }),
    ]);
    return {
      count: reveals + searches,
      oldest: earliest(oldestReveal._min.revealedAt, oldestSearch._min.searchedAt),
    };
  }

  async pruneBatch(cutoff: Date, limit: number): Promise<number> {
    const reveals = await this.prisma.$executeRaw`
      DELETE FROM "mail"."mail_recipient_reveal" WHERE "id" IN (
        SELECT "id" FROM "mail"."mail_recipient_reveal"
         WHERE "revealed_at" < ${cutoff} ORDER BY "revealed_at" LIMIT ${limit})`;
    if (reveals >= limit) {
      return reveals;
    }
    const searches = await this.prisma.$executeRaw`
      DELETE FROM "mail"."mail_recipient_search" WHERE "id" IN (
        SELECT "id" FROM "mail"."mail_recipient_search"
         WHERE "searched_at" < ${cutoff} ORDER BY "searched_at" LIMIT ${limit - reveals})`;
    return reveals + searches;
  }
}

function earliest(left: Date | null, right: Date | null): Date | null {
  if (left === null) return right;
  if (right === null) return left;
  return left < right ? left : right;
}
